from dotenv import load_dotenv
load_dotenv()
import os
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query, Form
from fastapi.responses import StreamingResponse, RedirectResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import csv
import re
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone, timedelta
try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo
import bcrypt
import jwt
from bson import ObjectId
import pandas as pd

# Google API Imports
import google.oauth2.credentials
import google_auth_oauthlib.flow
from googleapiclient.discovery import build
import google.auth.transport.requests
import json
import httplib2

# MongoDB connection
mongo_url = os.environ.get('MONGODB_URI') or os.environ.get('MONGO_URL')
if not mongo_url:
    raise RuntimeError("MONGODB_URI or MONGO_URL environment variable is required")
import certifi
client = AsyncIOMotorClient(mongo_url, tlsCAFile=certifi.where())
db = client[os.environ.get('DB_NAME', 'wedus_crm')]

# JWT Config
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Create the main app
app = FastAPI(title="Wed Us CRM API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== HELPER FUNCTIONS ==============

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def serialize_doc(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    result = {}
    for key, value in doc.items():
        if key == "_id":
            result["id"] = str(value)
        elif isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, list):
            result[key] = [serialize_doc(item) if isinstance(item, dict) else item for item in value]
        elif isinstance(value, dict):
            result[key] = serialize_doc(value)
        else:
            result[key] = value
    return result

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return serialize_doc(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ============== GOOGLE CALENDAR HELPERS ==============

async def get_google_calendar_service(user: dict):
    if not user.get("googleRefreshToken"):
        return None
    
    creds = google.oauth2.credentials.Credentials(
        token=user.get("googleAccessToken"),
        refresh_token=user.get("googleRefreshToken"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    )

    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(google.auth.transport.requests.Request())
            # Update the user's access token in the database
            await db.users.update_one(
                {"_id": ObjectId(user["id"])},
                {
                    "$set": {
                        "googleAccessToken": creds.token,
                        "googleTokenExpiry": creds.expiry
                    }
                }
            )
        except Exception as e:
            logger.error(f"Failed to refresh Google token for user {user.get('email')}: {str(e)}")
            return None

    try:
        service = build("calendar", "v3", credentials=creds)
        return service
    except Exception as e:
        logger.error(f"Failed to build Google Calendar service for user {user.get('email')}: {str(e)}")
        return None

async def create_or_update_google_event(user: dict, lead: dict, followUpDate: datetime) -> Optional[str]:
    service = await get_google_calendar_service(user)
    if not service:
        return None
    kolkata_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    
    # Ensure datetime is aware and in Asia/Kolkata
    if followUpDate.tzinfo is None:
        followUpDate = followUpDate.replace(tzinfo=kolkata_tz)
    else:
        followUpDate = followUpDate.astimezone(kolkata_tz)
        
    start_time = followUpDate.isoformat()
    end_time = (followUpDate + timedelta(minutes=30)).isoformat()
    timezone_str = "Asia/Kolkata"
    
    event_body = {
        'summary': f"📞 Call: {lead.get('companyName')}",
        'description': f"Person: {lead.get('personName', '')}\nPhone: {lead.get('phone', '')}\nPhone 2: {lead.get('phone2', '')}\nCategory: Callback\nVendor Type: {lead.get('vendorType', '')}\nCity: {lead.get('city', '')}\nPriority: {lead.get('priority', '')}",
        'start': {
            'dateTime': start_time,
            'timeZone': timezone_str,
        },
        'end': {
            'dateTime': end_time,
            'timeZone': timezone_str,
        },
        'reminders': {
            'useDefault': False,
            'overrides': [
                {'method': 'email', 'minutes': 30},
                {'method': 'popup', 'minutes': 15},
            ],
        },
    }
    
    event_id = lead.get('googleCalendarEventId')
    try:
        if event_id:
            # Update existing
            event = service.events().update(calendarId='primary', eventId=event_id, body=event_body).execute()
            return event.get('id')
        else:
            # Create new
            event = service.events().insert(calendarId='primary', body=event_body).execute()
            return event.get('id')
    except Exception as e:
        logger.error(f"Failed to create/update Google event for lead {lead.get('_id', lead.get('id'))}: {str(e)}")
        return None

async def delete_google_event(user: dict, event_id: str):
    if not event_id:
        return
    service = await get_google_calendar_service(user)
    if not service:
        return
    
    try:
        service.events().delete(calendarId='primary', eventId=event_id).execute()
    except Exception as e:
        logger.error(f"Failed to delete Google event {event_id}: {str(e)}")

async def sync_google_calendar(user: dict, old_lead: dict, new_lead: dict):
    if not user.get("googleRefreshToken"):
        return
    
    old_category = old_lead.get("category")
    new_category = new_lead.get("category")
    old_date = old_lead.get("followUpDate")
    new_date = new_lead.get("followUpDate")
    
    if isinstance(new_date, str):
        try:
            kolkata_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
            if new_date.endswith("Z") or "+00:00" in new_date:
                # Came in as UTC, convert to IST by adding 5h30m
                dt = datetime.fromisoformat(new_date.replace("Z", "+00:00"))
                new_date = dt.astimezone(kolkata_tz)
            else:
                # No timezone suffix, treat as IST directly
                dt = datetime.fromisoformat(new_date)
                if dt.tzinfo is None:
                    new_date = dt.replace(tzinfo=kolkata_tz)
                else:
                    new_date = dt.astimezone(kolkata_tz)
        except Exception:
            pass

    became_callback = (new_category == "Callback" and old_category != "Callback" and new_date)
    date_changed_while_callback = (new_category == "Callback" and old_category == "Callback" and new_date != old_date and new_date)
    
    if became_callback or date_changed_while_callback:
        if isinstance(new_date, datetime):
            event_id = await create_or_update_google_event(user, new_lead, new_date)
            if event_id and event_id != new_lead.get("googleCalendarEventId"):
                await db.leads.update_one({"_id": new_lead["_id"]}, {"$set": {"googleCalendarEventId": event_id}})
                
    elif old_category == "Callback" and new_category != "Callback":
        if new_lead.get("googleCalendarEventId"):
            await delete_google_event(user, new_lead["googleCalendarEventId"])
            await db.leads.update_one({"_id": new_lead["_id"]}, {"$unset": {"googleCalendarEventId": ""}})

# ============== PYDANTIC MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "team_member"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    color: Optional[str] = None
    created_at: Optional[str] = None

class TeamMemberCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    color: Optional[str] = None

class LeadCreate(BaseModel):
    companyName: str
    personName: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    city: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    profileUrl: Optional[str] = None
    type: Optional[str] = "NA"
    category: Optional[str] = None
    priority: Optional[str] = "Low"
    vendorType: Optional[str] = None
    chattingVia: Optional[str] = None
    followUpDate: Optional[datetime] = None
    googleCalendarEventId: Optional[str] = None
    lastUpdate: Optional[str] = None
    lastUpdateDate: Optional[datetime] = None

class LeadUpdate(BaseModel):
    companyName: Optional[str] = None
    personName: Optional[str] = None
    phone: Optional[str] = None
    phone2: Optional[str] = None
    city: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    profileUrl: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    vendorType: Optional[str] = None
    chattingVia: Optional[str] = None
    followUpDate: Optional[datetime] = None
    googleCalendarEventId: Optional[str] = None
    lastUpdate: Optional[str] = None
    lastUpdateDate: Optional[datetime] = None

class ResponseHistoryEntry(BaseModel):
    response: str
    notes: Optional[str] = None
    timestamp: Optional[str] = None
    teamMember: Optional[str] = None
    teamMemberName: Optional[str] = None
    duration: Optional[int] = None
    waNumberUsed: Optional[int] = None
    followUpDate: Optional[str] = None

class BulkAction(BaseModel):
    leadIds: List[str]
    action: str
    value: Optional[str] = None

# ============== CATEGORY/PRIORITY MAPPINGS ==============

CATEGORY_RANK = {
    "Meeting Done": 1,
    "Highly Interested": 2,
    "MND": 3,
    "Ongoing Project": 4,
    "Send Portfolio": 5,
    "Callback": 6
}

PRIORITY_RANK = {
    "Highest": 1,
    "High": 2,
    "Medium": 3,
    "Low": 4,
    "Review": 5,
    "Archive": 6
}

RESPONSE_RANK = {
    "Interested": 1,
    "Call Back": 2,
    "Meeting Done": 3,
    "Busy": 4,
    "No Response": 5,
    "Not Interested": 6,
    "Other": 7
}



TEAM_COLORS = ["#E8536A", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"]

ALL_RESPONSES = [
    "Interested", "Not Interested", "Call Again 1", "Call Again 2", "Call Again 3",
    "Send Portfolio", "Portfolio Sent — Will Let Us Know", "Meeting Scheduled", "Meeting Done",
    "Time Given", "Not Answering / Voicemail", "Busy — Call Back Later", "Wrong Number",
    "Switch Off", "In Meeting — Send Details", "Low Budget", "Inhouse Team",
    "Project Follow-up", "Weekly Message Sent", "Will Let Us Know"
]

# ============== IMPORT HELPERS ==============

def clean_phone(phone: str) -> str:
    """Clean phone number to plain digits"""
    if not phone:
        return ""
    cleaned = re.sub(r'[^\d]', '', str(phone))
    if cleaned.startswith('91') and len(cleaned) == 12:
        cleaned = cleaned[2:]
    return cleaned[-10:] if len(cleaned) >= 10 else cleaned

def clean_instagram(handle: str) -> str:
    """Clean instagram handle"""
    if not handle:
        return ""
    return str(handle).strip().lower().lstrip('@')

def fuzzy_category(value: str) -> str:
    """Map fuzzy category values to standard categories"""
    if not value:
        return "Needs Review"
    v = re.sub(r'[^\w\s]', '', str(value).lower().strip())
    mappings = {
        'interested': 'Interested', 'intrested': 'Interested', 'hot lead': 'Interested',
        'meeting done': 'Meeting Done', 'met': 'Meeting Done', 'md': 'Meeting Done',
        'call back': 'Call Back', 'callback': 'Call Back', 'follow up': 'Call Back', 'followup': 'Call Back', 'call again': 'Call Back', 'cb': 'Call Back',
        'busy': 'Busy', 'retry': 'Busy', 'call later': 'Busy', 'busy retry': 'Busy',
        'no response': 'No Response', 'nr': 'No Response', 'not reachable': 'No Response', 'not picking': 'No Response', 'no answer': 'No Response',
        'foreign': 'Foreign', 'international': 'Foreign', 'nri': 'Foreign', 'abroad': 'Foreign', 'overseas': 'Foreign',
        'future': 'Future Projection', 'future projection': 'Future Projection', 'not now': 'Future Projection', 'future lead': 'Future Projection',
        'not interested': 'Not Interested', 'ni': 'Not Interested', 'declined': 'Not Interested', 'rejected': 'Not Interested', 'not intrested': 'Not Interested',
        'needs review': 'Needs Review'
    }
    for key, val in mappings.items():
        if key in v:
            return val
    return "Needs Review"

def fuzzy_priority(value: str) -> str:
    """Map fuzzy priority values"""
    if not value:
        return "Low"
    v = str(value).lower().strip()
    if any(x in v for x in ['highest', 'urgent', 'very high', 'top']):
        return "Highest"
    if any(x in v for x in ['high', 'important']):
        return "High"
    if any(x in v for x in ['medium', 'mid', 'normal']):
        return "Medium"
    if 'low' in v:
        return "Low"
    return "Low"

def fuzzy_pipeline_stage(value: str) -> str:
    """Map fuzzy pipeline stage values"""
    if not value:
        return "Unknown"
    v = str(value).lower().strip()
    mappings = {
        'new': 'New Contact', 'fresh': 'New Contact', 'new contact': 'New Contact',
        'interested': 'Interested',
        'portfolio sent': 'Send Portfolio', 'send portfolio': 'Send Portfolio',
        'time given': 'Time Given',
        'meeting scheduled': 'Meeting Scheduled', 'meeting fixed': 'Meeting Scheduled', 'appointment': 'Meeting Scheduled',
        'meeting done': 'Meeting Done', 'met': 'Meeting Done',
        'project follow': 'Project Follow-up', 'post meeting': 'Project Follow-up',
        'onboarded': 'Onboarded', 'client': 'Onboarded', 'confirmed': 'Onboarded', 'booked': 'Onboarded',
        'call again 1': 'Call Again 1', 'retry 1': 'Call Again 1',
        'call again 2': 'Call Again 2', 'retry 2': 'Call Again 2',
        'call again 3': 'Call Again 3', 'retry 3': 'Call Again 3',
        'not answering': 'Not Answering', 'no answer': 'Not Answering', 'not picking': 'Not Answering',
        'not interested': 'Not Interested'
    }
    for key, val in mappings.items():
        if key in v:
            return val
    return "Unknown"

def parse_date(value) -> Optional[str]:
    """Parse various date formats to ISO string"""
    if not value or pd.isna(value):
        return None
    
    # If already datetime
    if isinstance(value, datetime):
        return value.isoformat()
    
    # Excel serial number
    if isinstance(value, (int, float)):
        try:
            excel_date = pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(value))
            return excel_date.isoformat()
        except Exception:
            pass
    
    value = str(value).strip()
    formats = [
        '%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y',
        '%d %b %Y', '%d %B %Y', '%Y/%m/%d', '%d.%m.%Y'
    ]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).isoformat()
        except ValueError:
            continue
    return None

def map_column_name(col: str) -> Optional[str]:
    """Map CSV column names to lead fields"""
    col = col.lower().strip()
    mappings = {
        'companyName': ['company', 'company name', 'firm', 'brand', 'client name', 'business name', 'companyname'],
        'personName': ['person', 'person name', 'contact person', 'contact name', 'name', 'client', 'poc', 'point of contact', 'personname'],
        'phone': ['phone', 'phone number', 'mobile', 'contact', 'number', 'ph', 'mob', 'cell', 'phone 1', 'primary phone', 'phone1'],
        'phone2': ['phone 2', 'phone2', 'alternate', 'alt phone', 'secondary', 'number 2', 'alternate phone'],
        'whatsapp': ['whatsapp', 'wa', 'wp', 'whatsapp number', 'wa number', 'whatsapp1', 'whatsapp 1'],
        'whatsapp2': ['whatsapp 2', 'wa2', 'wp2', 'whatsapp2', 'second whatsapp'],
        'instagram': ['instagram', 'insta', 'handle', 'ig', 'instagram handle', '@handle', 'insta handle'],
        'email': ['email', 'mail', 'email id', 'e-mail', 'emailid'],
        'city': ['city', 'location', 'place', 'region', 'area'],
        'category': ['category', 'cat', 'type', 'lead type', 'status'],
        'assignedTo': ['assigned to', 'assigned', 'owner', 'handled by', 'team member', 'rep', 'assignedto'],
        'notes': ['notes', 'feedback', 'remarks', 'comments', 'description', 'note'],
        'response1': ['response 1', 'response1', 'r1', 'call 1', 'first response'],
        'response2': ['response 2', 'response2', 'r2', 'call 2', 'second response'],
        'response3': ['response 3', 'response3', 'r3', 'call 3', 'third response'],
        'followUpDate': ['next follow-up', 'followup date', 'next call', 'callback date', 'follow up date', 'nextfollowupdate', 'next followup'],
        'lastContactDate': ['last contact', 'last contacted', 'last call date', 'date of last contact', 'lastcontactdate'],
        'portfolioSent': ['portfolio sent', 'portfolio', 'port sent', 'portfoliosent'],
        'priceListSent': ['price list sent', 'price list', 'pricelist', 'pricelistsent'],
        'pipelineStage': ['pipeline', 'stage', 'pipeline stage', 'workflow', 'pipelinestage'],
        'sourceSheet': ['source', 'source sheet', 'lead source', 'from', 'sourcesheet'],
        'priority': ['priority', 'importance'],
        'address': ['address', 'full address', 'addr'],
        'state': ['state', 'province']
    }
    for field, aliases in mappings.items():
        if col in aliases:
            return field
    return None

# ============== AUTH ROUTES ==============

@api_router.post("/auth/login")
async def login(credentials: UserLogin, response: Response):
    email = credentials.email.lower()
    user = await db.users.find_one({"email": email})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email, user["role"])
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    user_data = serialize_doc(user)
    user_data.pop("password_hash", None)
    return user_data

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"], user["role"])
        
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
        
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.get("/auth/google")
async def google_auth(request: Request):
    user = await get_current_user(request)
    
    import urllib.parse
    params = {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "redirect_uri": os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"),
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/calendar",
        "access_type": "offline",
        "prompt": "consent",
        "state": user["id"]
    }
    authorization_url = "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(params)
    
    return {"url": authorization_url}

@api_router.get("/auth/google/callback")
async def google_auth_callback(request: Request, state: str, code: str):
    try:
        import httpx
        
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri
                }
            )
            token_data = resp.json()
            
            if "error" in token_data:
                raise HTTPException(status_code=400, detail=f"Google OAuth Error: {token_data}")
                
            expiry = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3599))
            
            user_id = state
            await db.users.update_one(
                {"_id": ObjectId(user_id)},
                {
                    "$set": {
                        "googleAccessToken": token_data.get("access_token"),
                        "googleRefreshToken": token_data.get("refresh_token"),
                        "googleTokenExpiry": expiry
                }
            }
        )
        
        return RedirectResponse(url="http://localhost:3000/settings?google=connected")
    except Exception as e:
        logger.error(f"Google OAuth Callback Error: {str(e)}")
        return RedirectResponse(url="http://localhost:3000/settings?google=error")

@api_router.get("/auth/google/status")
async def google_auth_status(request: Request):
    user = await get_current_user(request)
    # Check if user has a refresh token
    connected = bool(user.get("googleRefreshToken"))
    return {"connected": connected}

@api_router.delete("/auth/google/disconnect")
async def google_auth_disconnect(request: Request):
    user = await get_current_user(request)
    
    # Revoke token with Google
    token = user.get("googleRefreshToken") or user.get("googleAccessToken")
    if token:
        try:
            revoke_request = httplib2.Http()
            revoke_request.request(
                f"https://oauth2.googleapis.com/revoke?token={token}",
                method="POST",
                headers={"content-type": "application/x-www-form-urlencoded"}
            )
        except Exception as e:
            logger.error(f"Failed to revoke Google token: {str(e)}")
            
    # Remove from DB
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {
            "$unset": {
                "googleAccessToken": "",
                "googleRefreshToken": "",
                "googleTokenExpiry": ""
            }
        }
    )
    
    return {"message": "Disconnected"}

# ============== PROFILE / SETTINGS ROUTES ==============

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    color: Optional[str] = None

class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: str

class AppSettings(BaseModel):
    duplicateDetectionEnabled: Optional[bool] = None

@api_router.put("/auth/profile")
async def update_profile(body: ProfileUpdate, request: Request, response: Response):
    """Update current user's profile (name, email, color)."""
    user = await get_current_user(request)
    user_id = user["id"]
    update = {}

    if body.name is not None and body.name.strip():
        update["name"] = body.name.strip()

    if body.color is not None:
        update["color"] = body.color

    if body.email is not None:
        new_email = body.email.lower().strip()
        if new_email != user.get("email"):
            existing = await db.users.find_one({"email": new_email})
            if existing:
                raise HTTPException(status_code=400, detail="Email already in use")
            update["email"] = new_email

    if not update:
        raise HTTPException(status_code=400, detail="No changes provided")

    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})

    # If email changed, re-issue tokens with new email
    updated_user = await db.users.find_one({"_id": ObjectId(user_id)})
    new_access = create_access_token(user_id, updated_user["email"], updated_user["role"])
    response.set_cookie(key="access_token", value=new_access, httponly=True, secure=False, samesite="lax", max_age=900, path="/")

    result = serialize_doc(updated_user)
    result.pop("password_hash", None)
    return result

@api_router.put("/auth/password")
async def change_password(body: PasswordChange, request: Request):
    """Change current user's password."""
    user = await get_current_user(request)
    user_id = user["id"]

    full_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not verify_password(body.currentPassword, full_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.newPassword) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    new_hash = hash_password(body.newPassword)
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password_hash": new_hash}})
    return {"message": "Password changed successfully"}

@api_router.get("/settings")
async def get_app_settings(request: Request):
    """Get global app settings."""
    await get_current_user(request)
    settings = await db.settings.find_one({"_id": "app_settings"})
    if not settings:
        return {"duplicateDetectionEnabled": True}
    return {"duplicateDetectionEnabled": settings.get("duplicateDetectionEnabled", True)}

@api_router.put("/settings")
async def update_app_settings(body: AppSettings, request: Request):
    """Update global app settings (admin only)."""
    await require_admin(request)
    update = {}
    if body.duplicateDetectionEnabled is not None:
        update["duplicateDetectionEnabled"] = body.duplicateDetectionEnabled
    if not update:
        raise HTTPException(status_code=400, detail="No changes provided")
    await db.settings.update_one(
        {"_id": "app_settings"},
        {"$set": update},
        upsert=True
    )
    return {**update, "message": "Settings updated"}

# ============== TEAM ROUTES ==============

@api_router.get("/team")
async def get_team_members(request: Request):
    await get_current_user(request)
    members = await db.users.find({}, {"password_hash": 0}).to_list(100)
    return [serialize_doc(m) for m in members]

@api_router.post("/team")
async def create_team_member(member: TeamMemberCreate, request: Request):
    await require_admin(request)
    
    existing = await db.users.find_one({"email": member.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    count = await db.users.count_documents({})
    color = member.color or TEAM_COLORS[count % len(TEAM_COLORS)]
    
    user_doc = {
        "email": member.email.lower(),
        "password_hash": hash_password(member.password),
        "name": member.name,
        "role": "team_member",
        "color": color,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    user_data = serialize_doc(user_doc)
    user_data.pop("password_hash", None)
    return user_data

@api_router.delete("/team/{user_id}")
async def delete_team_member(user_id: str, request: Request):
    await require_admin(request)
    
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Team member deleted"}

# ============== LEADS ROUTES ==============

def calculate_ranks(lead_data: dict) -> dict:
    """Calculate and add rank fields based on category, priority, and response"""
    if "category" in lead_data and lead_data["category"]:
        lead_data["categoryRank"] = CATEGORY_RANK.get(lead_data["category"], 99)
    if "priority" in lead_data and lead_data["priority"]:
        lead_data["priorityRank"] = PRIORITY_RANK.get(lead_data["priority"], 99)
    return lead_data

def calculate_most_common_response(response_history: list) -> tuple:
    """Calculate most common response from history"""
    if not response_history:
        return None, None
    
    response_counts = {}
    for entry in response_history:
        resp = entry.get("response", "Other")
        response_counts[resp] = response_counts.get(resp, 0) + 1
    
    most_common = max(response_counts, key=response_counts.get)
    rank = RESPONSE_RANK.get(most_common, 7)
    return most_common, rank

async def _get_leads_for_date_range(request: Request, start_date: datetime, end_date: datetime):
    user = await get_current_user(request)
    query = {"followUpDate": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}
    if user["role"] == "team_member":
        query["assignedTo"] = user["id"]
        
    leads = await db.leads.find(query).sort("followUpDate", 1).to_list(1000)
    return {"leads": [serialize_doc(lead) for lead in leads], "total": len(leads)}

@api_router.get("/leads/today")
async def get_leads_today(request: Request):
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return await _get_leads_for_date_range(request, start, end)

@api_router.get("/leads/tomorrow")
async def get_leads_tomorrow(request: Request):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = today_start + timedelta(days=1)
    end = start + timedelta(days=1)
    return await _get_leads_for_date_range(request, start, end)

@api_router.get("/leads/this-week")
async def get_leads_this_week(request: Request):
    # This week (Monday to Sunday)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Get current day of week (0=Monday, 6=Sunday)
    days_since_monday = today_start.weekday()
    start = today_start - timedelta(days=days_since_monday)
    end = start + timedelta(days=7)
    return await _get_leads_for_date_range(request, start, end)

@api_router.get("/leads")
async def get_leads(
    request: Request,
    type: Optional[str] = None,
    category: Optional[str] = None,
    vendorType: Optional[str] = None,
    priority: Optional[str] = None,
    pipelineStage: Optional[str] = None,
    assignedTo: Optional[str] = None,
    search: Optional[str] = None,
    source: Optional[str] = None,
    city: Optional[str] = None,
    portfolioSent: Optional[bool] = None,
    mostCommonResponse: Optional[str] = None,
    showDuplicatesOnly: Optional[bool] = False,
    chattingVia: Optional[str] = None,
    sortField: Optional[str] = "categoryRank",
    sortDirection: Optional[int] = 1,
    sortField2: Optional[str] = None,
    sortDirection2: Optional[int] = 1,
    followUpFrom: Optional[datetime] = None,
    followUpTo: Optional[datetime] = None,
    limit: int = 50,
    skip: int = 0
):
    user = await get_current_user(request)
    
    query = {}
    
    # Team members can only see their assigned leads
    if user["role"] == "team_member":
        query["assignedTo"] = user["id"]
    elif assignedTo:
        query["assignedTo"] = assignedTo
    
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if vendorType:
        query["vendorType"] = vendorType
    if priority:
        query["priority"] = priority
    if pipelineStage:
        query["pipelineStage"] = pipelineStage
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if portfolioSent is not None:
        query["portfolioSent"] = portfolioSent
    if mostCommonResponse:
        query["mostCommonResponse"] = mostCommonResponse
    if showDuplicatesOnly:
        query["isDuplicate"] = True
        query["duplicateDismissed"] = {"$ne": True}
    if chattingVia:
        query["chattingVia"] = {"$regex": chattingVia, "$options": "i"}
    if source == "instagram":
        query["instagram"] = {"$exists": True, "$nin": [None, ""]}
    elif source == "whatsapp":
        query["$or"] = [
            {"whatsapp": {"$exists": True, "$nin": [None, ""]}},
            {"whatsapp2": {"$exists": True, "$nin": [None, ""]}}
        ]
    elif source:
        query["sourceSheet"] = {"$regex": source, "$options": "i"}
        
    if followUpFrom or followUpTo:
        date_filter_dt = {}
        date_filter_str = {}
        
        if followUpFrom:
            date_filter_dt["$gte"] = followUpFrom
            # Format datetime as ISO string exactly as it might be stored
            date_filter_str["$gte"] = followUpFrom.isoformat().replace("+00:00", "Z")
        if followUpTo:
            date_filter_dt["$lte"] = followUpTo
            date_filter_str["$lte"] = followUpTo.isoformat().replace("+00:00", "Z")
            
        # MongoDB $or for both formats since it can be stored as BSON Date or String
        date_query = {
            "$or": [
                {"followUpDate": date_filter_dt},
                {"followUpDate": date_filter_str}
            ]
        }
        
        if query:
            query = {"$and": [query, date_query]}
        else:
            query = date_query
    
    if search:
        search_query = {"$or": [
            {"companyName": {"$regex": search, "$options": "i"}},
            {"personName": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"phone2": {"$regex": search, "$options": "i"}},
            {"instagram": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}}
        ]}
        if query:
            query = {"$and": [query, search_query]}
        else:
            query = search_query
    
    # Build sort
    sort_list = []
    if sortField:
        sort_list.append((sortField, sortDirection))
    if sortField2:
        sort_list.append((sortField2, sortDirection2))
    if not sort_list:
        sort_list = [("categoryRank", 1), ("priorityRank", 1)]
    
    total = await db.leads.count_documents(query)
    leads = await db.leads.find(query).sort(sort_list).skip(skip).limit(limit).to_list(limit)
    
    return {
        "leads": [serialize_doc(lead) for lead in leads],
        "total": total,
        "skip": skip,
        "limit": limit
    }

@api_router.get("/leads/count")
async def get_leads_count(request: Request):
    user = await get_current_user(request)
    
    base_query = {}
    if user["role"] == "team_member":
        base_query["assignedTo"] = user["id"]
    
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    week_end = today + timedelta(days=7)
    
    counts = {
        "total": await db.leads.count_documents(base_query),
        "today": await db.leads.count_documents({**base_query, "followUpDate": {"$gte": today.isoformat(), "$lt": tomorrow.isoformat()}}),
        "tomorrow": await db.leads.count_documents({**base_query, "followUpDate": {"$gte": tomorrow.isoformat(), "$lt": (tomorrow + timedelta(days=1)).isoformat()}}),
        "thisWeek": await db.leads.count_documents({**base_query, "followUpDate": {"$gte": today.isoformat(), "$lt": week_end.isoformat()}}),
        "meetingDone": await db.leads.count_documents({**base_query, "category": "Meeting Done"}),
        "highlyInterested": await db.leads.count_documents({**base_query, "category": "Highly Interested"}),
        "mnd": await db.leads.count_documents({**base_query, "category": "MND"}),
        "ongoingProject": await db.leads.count_documents({**base_query, "category": "Ongoing Project"}),
        "sendPortfolio": await db.leads.count_documents({**base_query, "category": "Send Portfolio"}),
        "callback": await db.leads.count_documents({**base_query, "category": "Callback"}),
        "instagram": await db.leads.count_documents({**base_query, "instagram": {"$exists": True, "$nin": [None, ""]}}),
        "whatsapp": await db.leads.count_documents({**base_query, "$or": [{"whatsapp": {"$exists": True, "$nin": [None, ""]}}, {"whatsapp2": {"$exists": True, "$nin": [None, ""]}}]}),
        "duplicates": await db.leads.count_documents({**base_query, "isDuplicate": True, "duplicateDismissed": {"$ne": True}})
    }
    
    return counts

@api_router.get("/leads/cities")
async def get_cities(request: Request):
    """Get unique cities for filter dropdown"""
    await get_current_user(request)
    cities = await db.leads.distinct("city")
    return [c for c in cities if c]

@api_router.get("/leads/sources")
async def get_sources(request: Request):
    """Get unique sources for filter dropdown"""
    await get_current_user(request)
    sources = await db.leads.distinct("sourceSheet")
    return [s for s in sources if s]

@api_router.get("/leads/export")
async def export_leads(
    request: Request,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    assignedTo: Optional[str] = None,
    search: Optional[str] = None,
    city: Optional[str] = None
):
    """Export leads to CSV"""
    user = await get_current_user(request)
    
    query = {}
    if user["role"] == "team_member":
        query["assignedTo"] = user["id"]
    elif assignedTo:
        query["assignedTo"] = assignedTo
    
    if category:
        query["category"] = category
    if priority:
        query["priority"] = priority
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if search:
        query["$or"] = [
            {"companyName": {"$regex": search, "$options": "i"}},
            {"personName": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}}
        ]
    
    leads = await db.leads.find(query, {"_id": 0}).to_list(10000)
    
    output = io.StringIO()
    if leads:
        writer = csv.DictWriter(output, fieldnames=leads[0].keys())
        writer.writeheader()
        for lead in leads:
            # Flatten responseHistory
            if 'responseHistory' in lead:
                lead['responseHistory'] = str(lead['responseHistory'])
            writer.writerow(lead)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=leads_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, request: Request):
    user = await get_current_user(request)
    
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check access
    if user["role"] == "team_member" and lead.get("assignedTo") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return serialize_doc(lead)

@api_router.post("/leads")
async def create_lead(lead: LeadCreate, request: Request):
    await get_current_user(request)
    
    lead_data = lead.model_dump()
    
    if lead_data.get("type") in ["No", "NA"]:
        lead_data["category"] = None
        
    lead_data = calculate_ranks(lead_data)
    
    now_iso = datetime.now(timezone.utc).isoformat()
    lead_data["createdAt"] = now_iso
    lead_data["updatedAt"] = now_iso
    lead_data["responseHistory"] = []
    lead_data["callCount"] = 0
    lead_data["isDuplicate"] = False
    lead_data["duplicateDismissed"] = False
    lead_data["mostCommonResponse"] = None
    lead_data["mostCommonResponseRank"] = None
    
    # Check for duplicates
    await check_and_mark_duplicate(lead_data)
    
    result = await db.leads.insert_one(lead_data)
    lead_data["_id"] = result.inserted_id
    
    return serialize_doc(lead_data)

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, lead_update: LeadUpdate, request: Request):
    user = await get_current_user(request)
    
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Check access
    if user["role"] == "team_member" and lead.get("assignedTo") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in lead_update.model_dump().items() if v is not None}
    
    if "type" in update_data and update_data["type"] in ["No", "NA"]:
        update_data["category"] = None
    elif update_data.get("type") not in ["No", "NA"] and "type" not in update_data and lead.get("type") in ["No", "NA"]:
        pass # If we update category while type is No/NA, maybe we should block or allow? The spec says "When type is set to No or NA, automatically set category to null."
        # Actually if type is No/NA in the DB, and we update it, let's make sure it's enforced.
    
    if update_data.get("type") in ["No", "NA"] or (lead.get("type") in ["No", "NA"] and update_data.get("type") is None and "type" not in update_data):
         # Enforce null category if type is No/NA
         if "type" in update_data and update_data["type"] in ["No", "NA"]:
             update_data["category"] = None
         elif lead.get("type") in ["No", "NA"] and update_data.get("category"):
             # Or if they try to update category while type is No/NA, we should probably ignore it or change type?
             # Let's just strictly enforce when type is updated.
             pass
             
    # Simpler: just enforce if 'type' is present in update_data or we can just check the final merged state.
    final_type = update_data.get("type", lead.get("type"))
    if final_type in ["No", "NA"]:
        update_data["category"] = None

    update_data = calculate_ranks(update_data)
    update_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    
    if "lastUpdate" in update_data:
        update_data["lastUpdateDate"] = datetime.now(timezone.utc).isoformat()
    
    # If category changed to Not Interested, set dateMarkedNotInterested
    if update_data.get("category") == "Not Interested" and lead.get("category") != "Not Interested":
        update_data["dateMarkedNotInterested"] = datetime.now(timezone.utc).isoformat()
    
    await db.leads.update_one({"_id": ObjectId(lead_id)}, {"$set": update_data})
    
    updated_lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    await sync_google_calendar(user, lead, updated_lead)
    return serialize_doc(updated_lead)

@api_router.patch("/leads/{lead_id}")
async def patch_lead(lead_id: str, updates: dict, request: Request):
    """Inline edit single field"""
    user = await get_current_user(request)
    
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if user["role"] == "team_member" and lead.get("assignedTo") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Enforce type logic
    final_type = updates.get("type", lead.get("type"))
    if final_type in ["No", "NA"]:
        updates["category"] = None
        
    # Recalculate ranks if needed
    updates = calculate_ranks(updates)
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    
    if "lastUpdate" in updates:
        updates["lastUpdateDate"] = datetime.now(timezone.utc).isoformat()
    
    await db.leads.update_one({"_id": ObjectId(lead_id)}, {"$set": updates})
    
    updated_lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    await sync_google_calendar(user, lead, updated_lead)
    return serialize_doc(updated_lead)

@api_router.post("/leads/{lead_id}/response")
async def add_response_history(lead_id: str, entry: ResponseHistoryEntry, request: Request):
    user = await get_current_user(request)
    
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    if user["role"] == "team_member" and lead.get("assignedTo") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    entry_data = entry.model_dump()
    entry_data["timestamp"] = datetime.now(timezone.utc).isoformat()
    entry_data["teamMember"] = user["id"]
    entry_data["teamMemberName"] = user.get("name", "Unknown")
    
    # Update response history and recalculate most common response
    response_history = lead.get("responseHistory", [])
    response_history.append(entry_data)
    
    most_common, rank = calculate_most_common_response(response_history)
    update_data = {
        "mostCommonResponse": most_common,
        "mostCommonResponseRank": rank,
        "lastContactDate": entry_data["timestamp"]
    }
    # Update category based on response
    response_to_category = {
        "Interested": "Interested",
        "Not Interested": "Not Interested",
        "Meeting Done": "Meeting Done",
        "Busy — Call Back Later": "Busy",
        "Call Again 1": "Call Back",
        "Call Again 2": "Call Back",
        "Call Again 3": "Call Back",
        "Not Answering / Voicemail": "No Response"
    }
    if entry_data["response"] in response_to_category:
        new_cat = response_to_category[entry_data["response"]]
        update_data["category"] = new_cat
        update_data["categoryRank"] = CATEGORY_RANK.get(new_cat, 99)
    
    # Update next follow-up
    if entry_data.get("followUpDate"):
        update_data["followUpDate"] = entry_data["followUpDate"]
    
    await db.leads.update_one(
        {"_id": ObjectId(lead_id)},
        {
            "$push": {"responseHistory": entry_data},
            "$inc": {"callCount": 1},
            "$set": update_data
        }
    )
    
    updated_lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    await sync_google_calendar(user, lead, updated_lead)
    return serialize_doc(updated_lead)

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, request: Request):
    user = await get_current_user(request)
    await require_admin(request)
    
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if lead and lead.get("googleCalendarEventId"):
        await delete_google_event(user, lead["googleCalendarEventId"])
    
    result = await db.leads.delete_one({"_id": ObjectId(lead_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return {"message": "Lead deleted"}

class ChattingViaUpdate(BaseModel):
    chattingVia: Optional[str] = None

@api_router.put("/leads/{lead_id}/chatting-via")
async def update_chatting_via(lead_id: str, body: ChattingViaUpdate, request: Request):
    """Quick update the chattingVia field for a lead."""
    user = await get_current_user(request)
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user["role"] == "team_member" and lead.get("assignedTo") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.leads.update_one(
        {"_id": ObjectId(lead_id)},
        {"$set": {"chattingVia": body.chattingVia}}
    )
    return {"message": "Updated", "chattingVia": body.chattingVia}

@api_router.post("/leads/bulk")
async def bulk_action(action: BulkAction, request: Request):
    """Perform bulk actions on leads"""
    user = await get_current_user(request)
    
    if action.action == "delete":
        await require_admin(request)
        result = await db.leads.delete_many({
            "_id": {"$in": [ObjectId(id) for id in action.leadIds]}
        })
        return {"message": f"Deleted {result.deleted_count} leads"}
    
    elif action.action == "reassign":
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        await db.leads.update_many(
            {"_id": {"$in": [ObjectId(id) for id in action.leadIds]}},
            {"$set": {"assignedTo": action.value}}
        )
        return {"message": f"Reassigned {len(action.leadIds)} leads"}
    
    elif action.action == "update_category":
        update_data = {"category": action.value}
        update_data = calculate_ranks(update_data)
        await db.leads.update_many(
            {"_id": {"$in": [ObjectId(id) for id in action.leadIds]}},
            {"$set": update_data}
        )
        return {"message": f"Updated {len(action.leadIds)} leads"}
    
    elif action.action == "update_priority":
        update_data = {"priority": action.value}
        update_data = calculate_ranks(update_data)
        await db.leads.update_many(
            {"_id": {"$in": [ObjectId(id) for id in action.leadIds]}},
            {"$set": update_data}
        )
        return {"message": f"Updated {len(action.leadIds)} leads"}
    
    raise HTTPException(status_code=400, detail="Invalid action")

# ============== DUPLICATE DETECTION ==============

async def check_and_mark_duplicate(lead_data: dict, exclude_id: str = None) -> Optional[dict]:
    """Check if lead is duplicate and mark it. Respects global setting."""
    # Check if duplicate detection is enabled
    settings = await db.settings.find_one({"_id": "app_settings"})
    if settings and not settings.get("duplicateDetectionEnabled", True):
        return None

    query_conditions = []
    
    # Check phone numbers
    for field in ['phone', 'phone2', 'whatsapp']:
        if lead_data.get(field):
            cleaned = clean_phone(lead_data[field])
            if cleaned:
                query_conditions.append({"phone": {"$regex": cleaned}})
                query_conditions.append({"phone2": {"$regex": cleaned}})
                query_conditions.append({"whatsapp": {"$regex": cleaned}})
    
    # Check instagram
    if lead_data.get('instagram'):
        cleaned = clean_instagram(lead_data['instagram'])
        if cleaned:
            query_conditions.append({"instagram": {"$regex": f"^@?{cleaned}$", "$options": "i"}})
    
    # Check company name + city
    if lead_data.get('companyName') and lead_data.get('city'):
        company_clean = re.sub(r'\s+', '', lead_data['companyName'].lower())
        city_clean = re.sub(r'\s+', '', lead_data['city'].lower())
        query_conditions.append({
            "$and": [
                {"companyName": {"$regex": company_clean, "$options": "i"}},
                {"city": {"$regex": city_clean, "$options": "i"}}
            ]
        })
    
    if not query_conditions:
        return None
    
    query = {"$or": query_conditions}
    if exclude_id:
        query["_id"] = {"$ne": ObjectId(exclude_id)}
    
    existing = await db.leads.find_one(query)
    if existing:
        lead_data["isDuplicate"] = True
        lead_data["duplicateOf"] = str(existing["_id"])
        return serialize_doc(existing)
    
    return None

@api_router.post("/leads/detect-duplicates")
async def detect_duplicates(request: Request):
    """Detect and mark all duplicates in database"""
    await require_admin(request)
    
    # Reset all duplicate flags first
    await db.leads.update_many({}, {"$set": {"isDuplicate": False, "duplicateOf": None}})
    
    leads = await db.leads.find({}, {"_id": 1, "phone": 1, "phone2": 1, "whatsapp": 1, "instagram": 1, "companyName": 1, "city": 1}).to_list(None)
    
    phone_map = {}
    instagram_map = {}
    company_city_map = {}
    duplicates_found = 0
    
    for lead in leads:
        lead_id = str(lead["_id"])
        duplicate_of = None
        
        # Check phones
        for field in ['phone', 'phone2', 'whatsapp']:
            if lead.get(field):
                cleaned = clean_phone(lead[field])
                if cleaned:
                    if cleaned in phone_map:
                        duplicate_of = phone_map[cleaned]
                        break
                    phone_map[cleaned] = lead_id
        
        # Check instagram
        if not duplicate_of and lead.get('instagram'):
            cleaned = clean_instagram(lead['instagram'])
            if cleaned:
                if cleaned in instagram_map:
                    duplicate_of = instagram_map[cleaned]
                else:
                    instagram_map[cleaned] = lead_id
        
        # Check company+city
        if not duplicate_of and lead.get('companyName') and lead.get('city'):
            key = f"{re.sub(r's+', '', lead['companyName'].lower())}_{re.sub(r's+', '', lead['city'].lower())}"
            if key in company_city_map:
                duplicate_of = company_city_map[key]
            else:
                company_city_map[key] = lead_id
        
        if duplicate_of and duplicate_of != lead_id:
            await db.leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"isDuplicate": True, "duplicateOf": duplicate_of}}
            )
            duplicates_found += 1
    
    return {"message": f"Found and marked {duplicates_found} duplicates"}

@api_router.post("/leads/{lead_id}/dismiss-duplicate")
async def dismiss_duplicate(lead_id: str, request: Request):
    """Dismiss duplicate flag"""
    await get_current_user(request)
    
    await db.leads.update_one(
        {"_id": ObjectId(lead_id)},
        {"$set": {"duplicateDismissed": True}}
    )
    return {"message": "Duplicate dismissed"}

@api_router.get("/leads/{lead_id}/duplicates")
async def get_lead_duplicates(lead_id: str, request: Request):
    """Get all duplicates of a lead"""
    await get_current_user(request)
    
    lead = await db.leads.find_one({"_id": ObjectId(lead_id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Find all leads with same duplicateOf or that are duplicateOf this lead
    duplicate_ids = [lead_id]
    if lead.get("duplicateOf"):
        duplicate_ids.append(lead["duplicateOf"])
    
    duplicates = await db.leads.find({
        "$or": [
            {"_id": {"$in": [ObjectId(id) for id in duplicate_ids]}},
            {"duplicateOf": {"$in": duplicate_ids}}
        ]
    }).to_list(None)
    
    return [serialize_doc(d) for d in duplicates]

# ============== IMPORT HELPERS ==============

def parse_lead_row(row, column_mapping, user_id: str, user_name: str) -> dict:
    """Parse a single DataFrame row into a lead data dict."""
    lead_data = {
        "dateAdded": datetime.now(timezone.utc).isoformat(),
        "responseHistory": [],
        "callCount": 0,
        "isDuplicate": False,
        "duplicateDismissed": False,
        "status": "active"
    }
    responses = []
    for orig_col, mapped_field in column_mapping.items():
        value = row.get(orig_col)
        if pd.isna(value):
            continue
        value = str(value).strip()
        if mapped_field == 'category':
            lead_data['category'] = fuzzy_category(value)
        elif mapped_field == 'priority':
            lead_data['priority'] = fuzzy_priority(value)
        elif mapped_field == 'pipelineStage':
            lead_data['pipelineStage'] = fuzzy_pipeline_stage(value)
        elif mapped_field in ['followUpDate', 'lastContactDate']:
            lead_data[mapped_field] = parse_date(value)
        elif mapped_field == 'phone':
            parts = [p.strip() for p in re.split(r'[,\s]+', value) if p.strip()]
            if parts:
                lead_data['phone'] = clean_phone(parts[0])
                if len(parts) > 1 and 'phone2' not in lead_data:
                    lead_data['phone2'] = clean_phone(parts[1])
        elif mapped_field in ['phone2', 'whatsapp', 'whatsapp2']:
            lead_data[mapped_field] = clean_phone(value)
        elif mapped_field == 'instagram':
            lead_data[mapped_field] = clean_instagram(value) or value
        elif mapped_field in ['portfolioSent', 'priceListSent']:
            lead_data[mapped_field] = str(value).lower() in ['yes', 'true', '1', 'sent']
        elif mapped_field in ['response1', 'response2', 'response3']:
            if value:
                responses.append(value)
        else:
            lead_data[mapped_field] = value

    if 'priority' not in lead_data or not lead_data['priority']:
        lead_data['priority'] = 'Low'
    if 'pipelineStage' not in lead_data or not lead_data['pipelineStage']:
        lead_data['pipelineStage'] = 'New Contact'

    lead_data = calculate_ranks(lead_data)

    for resp in responses:
        lead_data['responseHistory'].append({
            "response": resp,
            "timestamp": lead_data['dateAdded'],
            "teamMember": user_id,
            "teamMemberName": user_name
        })
        lead_data['callCount'] += 1

    if lead_data['responseHistory']:
        most_common, rank = calculate_most_common_response(lead_data['responseHistory'])
        lead_data['mostCommonResponse'] = most_common
        lead_data['mostCommonResponseRank'] = rank

    return lead_data


def read_file_to_df(content: bytes, filename: str, nrows=None):
    """Read CSV/Excel content into a pandas DataFrame."""
    if filename.endswith('.xlsx') or filename.endswith('.xls'):
        return pd.read_excel(io.BytesIO(content), nrows=nrows)
    for encoding in ['utf-8', 'latin-1', 'cp1252']:
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding, nrows=nrows)
        except Exception:
            continue
    raise HTTPException(status_code=400, detail="Failed to read file with any encoding")


def get_match_reason(lead_data: dict, existing: dict) -> str:
    """Determine why two leads are considered duplicates."""
    for field in ['phone', 'phone2', 'whatsapp']:
        if lead_data.get(field):
            cleaned = clean_phone(lead_data[field])
            if cleaned:
                for ef in ['phone', 'phone2', 'whatsapp']:
                    if existing.get(ef) and cleaned in clean_phone(str(existing.get(ef, ''))):
                        return f"{field} matches {ef}"
    if lead_data.get('instagram') and existing.get('instagram'):
        if clean_instagram(lead_data['instagram']) == clean_instagram(str(existing.get('instagram', ''))):
            return "instagram"
    if lead_data.get('companyName') and lead_data.get('city'):
        if existing.get('companyName') and existing.get('city'):
            c1 = re.sub(r'\s+', '', lead_data['companyName'].lower())
            c2 = re.sub(r'\s+', '', str(existing.get('companyName', '')).lower())
            ci1 = re.sub(r'\s+', '', lead_data['city'].lower())
            ci2 = re.sub(r'\s+', '', str(existing.get('city', '')).lower())
            if c1 == c2 and ci1 == ci2:
                return "companyName + city"
    return "unknown"


# ============== IMPORT ENDPOINTS ==============

@api_router.post("/leads/import/analyze")
async def analyze_import(request: Request, file: UploadFile = File(...), columnMapping: str = Form(...)):
    """Parse file, detect duplicates, return non-duplicates and duplicate pairs."""
    user = await get_current_user(request)
    content = await file.read()

    try:
        df = read_file_to_df(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    import json
    try:
        column_mapping = json.loads(columnMapping)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid column mapping format")

    non_duplicates = []
    duplicates = []
    errors = []

    for idx, row in df.iterrows():
        try:
            lead_data = parse_lead_row(row, column_mapping, user["id"], user.get("name", "Import"))

            if not lead_data.get('companyName'):
                errors.append({"row": idx + 2, "reason": "Missing company name"})
                continue

            existing = await check_and_mark_duplicate(lead_data)
            if existing:
                reason = get_match_reason(lead_data, existing)
                # Strip internal fields from incoming for frontend display
                incoming_clean = {k: v for k, v in lead_data.items() if k not in ['isDuplicate', 'duplicateOf', 'duplicateDismissed']}
                duplicates.append({
                    "rowIndex": idx + 2,
                    "incoming": incoming_clean,
                    "existing": existing,
                    "matchReason": reason
                })
            else:
                non_duplicates.append({
                    "rowIndex": idx + 2,
                    "data": lead_data
                })
        except Exception as e:
            errors.append({"row": idx + 2, "reason": str(e)})

    return {
        "nonDuplicates": non_duplicates,
        "duplicates": duplicates,
        "errors": errors[:50],
        "totalErrors": len(errors),
        "columnMapping": column_mapping
    }


class BatchImportRequest(BaseModel):
    leads: List[Dict[str, Any]]

@api_router.post("/leads/import/batch")
async def batch_import_leads(body: BatchImportRequest, request: Request):
    """Import a batch of pre-parsed non-duplicate leads."""
    await get_current_user(request)
    imported = 0
    errors = []

    for i, lead_data in enumerate(body.leads):
        try:
            # Remove any stale ObjectId-like fields
            lead_data.pop("id", None)
            lead_data.pop("_id", None)
            await db.leads.insert_one(lead_data)
            imported += 1
        except Exception as e:
            errors.append({"index": i, "reason": str(e)})

    return {"imported": imported, "errors": errors}


class DuplicateResolution(BaseModel):
    action: str  # skip, overwrite, import_anyway, merge
    incoming: Dict[str, Any]
    existingId: str

class ResolveRequest(BaseModel):
    resolutions: List[DuplicateResolution]

@api_router.post("/leads/import/resolve")
async def resolve_duplicates_import(body: ResolveRequest, request: Request):
    """Process user decisions for duplicate leads."""
    await get_current_user(request)
    skipped = 0
    overwritten = 0
    merged = 0
    imported_anyway = 0
    errors = []

    for res in body.resolutions:
        try:
            if res.action == "skip":
                skipped += 1
                continue

            elif res.action == "overwrite":
                update_data = {k: v for k, v in res.incoming.items() if v is not None}
                update_data.pop("id", None)
                update_data.pop("_id", None)
                update_data["isDuplicate"] = False
                update_data["duplicateOf"] = None
                await db.leads.replace_one(
                    {"_id": ObjectId(res.existingId)},
                    update_data
                )
                overwritten += 1

            elif res.action == "import_anyway":
                new_lead = dict(res.incoming)
                new_lead.pop("id", None)
                new_lead.pop("_id", None)
                new_lead["isDuplicate"] = True
                new_lead["duplicateOf"] = res.existingId
                await db.leads.insert_one(new_lead)
                imported_anyway += 1

            elif res.action == "merge":
                existing = await db.leads.find_one({"_id": ObjectId(res.existingId)})
                if not existing:
                    errors.append({"existingId": res.existingId, "reason": "Existing lead not found"})
                    continue

                merged_data = {}
                for key in existing:
                    if key == "_id":
                        continue
                    existing_val = existing.get(key)
                    incoming_val = res.incoming.get(key)
                    # For responseHistory, combine both
                    if key == "responseHistory":
                        existing_hist = existing_val if isinstance(existing_val, list) else []
                        incoming_hist = incoming_val if isinstance(incoming_val, list) else []
                        merged_data[key] = existing_hist + incoming_hist
                        continue
                    # For callCount, sum them
                    if key == "callCount":
                        merged_data[key] = (existing_val or 0) + (incoming_val or 0)
                        continue
                    # Prefer non-empty incoming value, else keep existing
                    if incoming_val and incoming_val != "" and incoming_val != "Needs Review":
                        merged_data[key] = incoming_val
                    elif existing_val:
                        merged_data[key] = existing_val
                    else:
                        merged_data[key] = incoming_val

                merged_data["isDuplicate"] = False
                merged_data["duplicateOf"] = None
                merged_data.pop("id", None)
                merged_data.pop("_id", None)

                # Recalculate most common response
                if merged_data.get("responseHistory"):
                    mc, rank = calculate_most_common_response(merged_data["responseHistory"])
                    merged_data["mostCommonResponse"] = mc
                    merged_data["mostCommonResponseRank"] = rank

                merged_data = calculate_ranks(merged_data)
                await db.leads.replace_one({"_id": ObjectId(res.existingId)}, merged_data)
                merged += 1

        except Exception as e:
            errors.append({"existingId": res.existingId, "reason": str(e)})

    return {
        "skipped": skipped,
        "overwritten": overwritten,
        "merged": merged,
        "importedAnyway": imported_anyway,
        "errors": errors
    }


# Keep legacy import endpoint for backward compat
@api_router.post("/leads/import")
async def import_leads(request: Request, file: UploadFile = File(...)):
    """Legacy import - auto-skips duplicates"""
    user = await get_current_user(request)
    content = await file.read()
    try:
        df = read_file_to_df(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    column_mapping = {}
    for col in df.columns:
        mapped = map_column_name(str(col))
        if mapped:
            column_mapping[str(col)] = mapped

    imported = 0
    duplicates_skipped = 0
    errors = []

    for idx, row in df.iterrows():
        try:
            lead_data = parse_lead_row(row, column_mapping, user["id"], user.get("name", "Import"))
            if not lead_data.get('companyName'):
                errors.append({"row": idx + 2, "reason": "Missing company name"})
                continue
            existing = await check_and_mark_duplicate(lead_data)
            if existing:
                duplicates_skipped += 1
                continue
            await db.leads.insert_one(lead_data)
            imported += 1
        except Exception as e:
            errors.append({"row": idx + 2, "reason": str(e)})

    return {
        "imported": imported,
        "duplicatesSkipped": duplicates_skipped,
        "errors": errors[:50],
        "totalErrors": len(errors),
        "columnMapping": column_mapping
    }

@api_router.post("/leads/import/preview")
async def preview_import(request: Request, file: UploadFile = File(...)):
    """Preview first 10 rows of import file"""
    await get_current_user(request)
    content = await file.read()

    df_preview = None
    full_df = None
    try:
        df_preview = read_file_to_df(content, file.filename, nrows=10)
        full_df = read_file_to_df(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    column_mapping = {}
    unmapped = []
    for col in df_preview.columns:
        mapped = map_column_name(str(col))
        if mapped:
            column_mapping[str(col)] = mapped
        else:
            unmapped.append(str(col))

    return {
        "columns": list(df_preview.columns),
        "columnMapping": column_mapping,
        "unmappedColumns": unmapped,
        "preview": df_preview.fillna("").to_dict(orient="records"),
        "totalRows": len(full_df)
    }

# ============== WHATSAPP TEMPLATES ==============

class TemplateCreate(BaseModel):
    name: str
    message: str
    category: Optional[str] = "General"

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    message: Optional[str] = None
    category: Optional[str] = None

@api_router.get("/templates")
async def get_templates(request: Request):
    """Get all WhatsApp message templates."""
    await get_current_user(request)
    templates = await db.templates.find({}).sort("category", 1).to_list(200)
    return [serialize_doc(t) for t in templates]

@api_router.post("/templates")
async def create_template(body: TemplateCreate, request: Request):
    """Create a WhatsApp message template (admin only)."""
    user = await require_admin(request)
    doc = {
        "name": body.name.strip(),
        "message": body.message.strip(),
        "category": body.category.strip() if body.category else "General",
        "createdBy": user["id"],
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    result = await db.templates.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)

@api_router.put("/templates/{template_id}")
async def update_template(template_id: str, body: TemplateUpdate, request: Request):
    """Update a WhatsApp message template (admin only)."""
    await require_admin(request)
    update = {}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.message is not None:
        update["message"] = body.message.strip()
    if body.category is not None:
        update["category"] = body.category.strip()
    if not update:
        raise HTTPException(status_code=400, detail="No changes provided")
    result = await db.templates.update_one({"_id": ObjectId(template_id)}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    updated = await db.templates.find_one({"_id": ObjectId(template_id)})
    return serialize_doc(updated)

@api_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, request: Request):
    """Delete a WhatsApp message template (admin only)."""
    await require_admin(request)
    result = await db.templates.delete_one({"_id": ObjectId(template_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}

# ============== CALENDAR ==============

@api_router.get("/calendar")
async def get_calendar_events(
    request: Request,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100)
):
    """Get leads with meetings or follow-ups in a given month."""
    user = await get_current_user(request)
    base_query = {}
    if user["role"] == "team_member":
        base_query["assignedTo"] = user["id"]

    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    start_iso = start.isoformat()
    end_iso = end.isoformat()

    # Follow-ups in this month
    followup_query = {**base_query, "followUpDate": {"$gte": start_iso, "$lt": end_iso}}
    followups = await db.leads.find(followup_query).to_list(500)

    # Meetings (pipeline stage = Meeting Scheduled or Meeting Done) with response history timestamps
    meeting_query = {
        **base_query,
        "pipelineStage": {"$in": ["Meeting Scheduled", "Meeting Done"]}
    }
    meetings = await db.leads.find(meeting_query).to_list(500)

    events = []
    seen_ids = set()

    for lead in followups:
        lid = str(lead["_id"])
        events.append({
            **serialize_doc(lead),
            "eventType": "followup",
            "eventDate": lead.get("followUpDate")
        })
        seen_ids.add(lid)

    for lead in meetings:
        lid = str(lead["_id"])
        if lid not in seen_ids:
            # Use followUpDate or lastContactDate as event date
            event_date = lead.get("followUpDate") or lead.get("lastContactDate") or lead.get("dateAdded")
            events.append({
                **serialize_doc(lead),
                "eventType": "meeting",
                "eventDate": event_date
            })

    return events

# ============== REMINDERS ==============

@api_router.get("/reminders")
async def get_reminders(request: Request):
    """Get overdue and upcoming follow-up reminders."""
    user = await get_current_user(request)
    base_query = {}
    if user["role"] == "team_member":
        base_query["assignedTo"] = user["id"]

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    tomorrow_end = today_start + timedelta(days=2)
    week_end = today_start + timedelta(days=7)

    # Overdue: follow-up date < today
    overdue_q = {**base_query, "followUpDate": {"$lt": today_start.isoformat(), "$ne": None}}
    overdue = await db.leads.find(overdue_q).sort("followUpDate", 1).to_list(100)

    # Today
    today_q = {**base_query, "followUpDate": {"$gte": today_start.isoformat(), "$lt": today_end.isoformat()}}
    today_leads = await db.leads.find(today_q).sort("followUpDate", 1).to_list(100)

    # Tomorrow
    tomorrow_q = {**base_query, "followUpDate": {"$gte": today_end.isoformat(), "$lt": tomorrow_end.isoformat()}}
    tomorrow_leads = await db.leads.find(tomorrow_q).sort("followUpDate", 1).to_list(100)

    # This week (rest of week after tomorrow)
    week_q = {**base_query, "followUpDate": {"$gte": tomorrow_end.isoformat(), "$lt": week_end.isoformat()}}
    week_leads = await db.leads.find(week_q).sort("followUpDate", 1).to_list(200)

    return {
        "overdue": [serialize_doc(lead) for lead in overdue],
        "today": [serialize_doc(lead) for lead in today_leads],
        "tomorrow": [serialize_doc(lead) for lead in tomorrow_leads],
        "thisWeek": [serialize_doc(lead) for lead in week_leads],
        "counts": {
            "overdue": len(overdue),
            "today": len(today_leads),
            "tomorrow": len(tomorrow_leads),
            "thisWeek": len(week_leads)
        }
    }

# ============== DASHBOARD STATS ==============

@api_router.get("/stats/dashboard")
async def get_dashboard_stats(request: Request):
    user = await get_current_user(request)
    
    base_query = {}
    if user["role"] == "team_member":
        base_query["assignedTo"] = user["id"]
    
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    week_end = today + timedelta(days=7)
    
    # Category mapped pipeline stats
    pipeline_stats = []
    for stage in CATEGORY_RANK.keys():
        count = await db.leads.count_documents({**base_query, "category": stage})
        pipeline_stats.append({"stage": stage, "count": count})
    
    # Category breakdown
    category_stats = []
    for cat, rank in CATEGORY_RANK.items():
        count = await db.leads.count_documents({**base_query, "category": cat})
        category_stats.append({"category": cat, "count": count, "rank": rank})
    
    # Priority breakdown
    priority_stats = []
    for pri, rank in PRIORITY_RANK.items():
        count = await db.leads.count_documents({**base_query, "priority": pri})
        priority_stats.append({"priority": pri, "count": count, "rank": rank})
    
    stats = {
        "totalLeads": await db.leads.count_documents(base_query),
        "todayFollowups": await db.leads.count_documents({**base_query, "followUpDate": {"$gte": today.isoformat(), "$lt": tomorrow.isoformat()}}),
        "tomorrowFollowups": await db.leads.count_documents({**base_query, "followUpDate": {"$gte": tomorrow.isoformat(), "$lt": (tomorrow + timedelta(days=1)).isoformat()}}),
        "weekFollowups": await db.leads.count_documents({**base_query, "followUpDate": {"$gte": today.isoformat(), "$lt": week_end.isoformat()}}),
        "interestedLeads": await db.leads.count_documents({**base_query, "category": "Interested"}),
        "meetingsDone": await db.leads.count_documents({**base_query, "category": "Meeting Done"}),
        "pipelineStats": pipeline_stats,
        "categoryStats": category_stats,
        "priorityStats": priority_stats,
        "teamMembers": await db.users.count_documents({}),
        "duplicates": await db.leads.count_documents({**base_query, "isDuplicate": True, "duplicateDismissed": {"$ne": True}})
    }
    
    return stats

@api_router.get("/responses")
async def get_response_options(request: Request):
    """Get all available response options"""
    await get_current_user(request)
    return ALL_RESPONSES

# ============== STARTUP ==============

@app.on_event("startup")
async def startup_db():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.leads.create_index("category")
    await db.leads.create_index("priority")
    await db.leads.create_index("pipelineStage")
    await db.leads.create_index("assignedTo")
    await db.leads.create_index("followUpDate")
    await db.leads.create_index("city")
    await db.leads.create_index("phone")
    await db.leads.create_index("instagram")
    await db.leads.create_index("isDuplicate")
    await db.leads.create_index([("categoryRank", 1), ("priorityRank", 1)])
    await db.leads.create_index([("companyName", "text"), ("city", "text")])
    
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@wedus.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "color": "#E8536A",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    
    # Seed sample team members
    sample_team = [
        {"name": "Priya Sharma", "email": "priya@wedus.com", "color": "#3B82F6"},
        {"name": "Rahul Mehta", "email": "rahul@wedus.com", "color": "#10B981"},
        {"name": "Ananya Singh", "email": "ananya@wedus.com", "color": "#F59E0B"}
    ]
    
    for member in sample_team:
        existing = await db.users.find_one({"email": member["email"]})
        if not existing:
            await db.users.insert_one({
                "email": member["email"],
                "password_hash": hash_password("team123"),
                "name": member["name"],
                "role": "team_member",
                "color": member["color"],
                "created_at": datetime.now(timezone.utc)
            })
            logger.info(f"Team member created: {member['email']}")
    
    # Write test credentials
    memory_dir = Path(__file__).parent.parent / "memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    with open(memory_dir / "test_credentials.md", "w") as f:
        f.write("# Wed Us CRM Test Credentials\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {admin_email}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write("- Role: admin\n\n")
        f.write("## Team Members\n")
        for member in sample_team:
            f.write(f"- Email: {member['email']}\n")
            f.write("- Password: team123\n")
            f.write("- Role: team_member\n\n")
    
    logger.info("Database initialized successfully")

    # Seed default WhatsApp templates
    template_count = await db.templates.count_documents({})
    if template_count == 0:
        default_templates = [
            {"name": "Introduction", "message": "Hi {company}! This is {team} from Wed Us Design. We specialize in premium wedding decor and design. Would love to discuss how we can make your event special!", "category": "First Contact"},
            {"name": "Portfolio Share", "message": "Hi {company}! As discussed, here is our portfolio: [link]. Please take a look and let us know your thoughts. We'd love to work with you!", "category": "Follow-up"},
            {"name": "Meeting Confirmation", "message": "Hi {company}! Just confirming our meeting scheduled for {date}. Looking forward to discussing your event requirements. See you soon!", "category": "Meeting"},
            {"name": "Post-Meeting Follow-up", "message": "Hi {company}! Great meeting you today. As discussed, we'll send over the detailed proposal shortly. Please feel free to reach out with any questions!", "category": "Follow-up"},
            {"name": "Price List", "message": "Hi {company}! Here is our updated price list as requested: [link]. Happy to customize a package that fits your budget. Let us know!", "category": "Sales"},
            {"name": "Thank You", "message": "Hi {company}! Thank you for choosing Wed Us Design! We are thrilled to be part of your special day. Our team will be in touch with the next steps.", "category": "Onboarding"},
            {"name": "Gentle Reminder", "message": "Hi {company}! Just a gentle follow-up on our previous conversation. Would you like to schedule a time to discuss further? We'd love to help!", "category": "Follow-up"},
            {"name": "Weekly Check-in", "message": "Hi {company}! Hope you're having a great week. Just checking in — any updates on your event planning? We're here to help whenever you're ready!", "category": "Follow-up"},
        ]
        for tmpl in default_templates:
            tmpl["createdBy"] = "system"
            tmpl["createdAt"] = datetime.now(timezone.utc).isoformat()
            await db.templates.insert_one(tmpl)
        logger.info(f"Seeded {len(default_templates)} default WhatsApp templates")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Wed Us CRM API", "version": "1.0.0"}

# Health check (no /api prefix — sits on app directly for Railway/infra probes)
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Include the router in the main app
app.include_router(api_router)

# CORS — allow frontend origin from env
_cors_origins_raw = os.environ.get("CORS_ORIGINS", "")
_frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")

if _cors_origins_raw == "*":
    _allowed_origins = ["*"]
elif _cors_origins_raw:
    _allowed_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]
else:
    _allowed_origins = [_frontend_url]
    if "http://localhost:3000" not in _allowed_origins:
        _allowed_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True if _allowed_origins != ["*"] else False,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

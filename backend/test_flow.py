import os
import google_auth_oauthlib.flow

os.environ["GOOGLE_CLIENT_ID"] = "test-id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://localhost:8000/api/auth/google/callback"

flow = google_auth_oauthlib.flow.Flow.from_client_config(
    {
        "web": {
            "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
            "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [os.environ.get("GOOGLE_REDIRECT_URI")]
        }
    },
    scopes=["https://www.googleapis.com/auth/calendar"]
)
flow.redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
url, state = flow.authorization_url(access_type='offline', prompt='consent', state='123')
print(url)

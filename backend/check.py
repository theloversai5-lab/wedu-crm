import asyncio, os, certifi
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient('mongodb+srv://pratiksinghbth:ZfM7N80mQG84nXZQ@cluster0.o7v4y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', tlsCAFile=certifi.where())
    db = client['wedus_crm']
    doc = await db.leads.find_one({'followUpDate': {'$exists': True, '$ne': None}})
    print(type(doc.get('followUpDate')), doc.get('followUpDate'))

asyncio.run(main())

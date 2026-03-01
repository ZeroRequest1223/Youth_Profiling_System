from typing import List, Optional
from sqlite3 import IntegrityError
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from helper_scripts.db import (
    init_db,
    add_barangay,
    list_barangays,
    add_youth_record,
    list_youth,
    update_youth,
    delete_youth,
)


class BarangayCreate(BaseModel):
    name: str


class YouthCreate(BaseModel):
    barangay_id: int
    name: str
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    program: Optional[str] = None
    notes: Optional[str] = None


class YouthUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    program: Optional[str] = None
    notes: Optional[str] = None


class YouthOut(BaseModel):
    id: int
    barangay_id: int
    name: str
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    program: Optional[str] = None
    date_enrolled: Optional[str] = None
    notes: Optional[str] = None
    barangay: Optional[str] = None


app = FastAPI(title="LYDO Monitoring API")


@app.on_event("startup")
def on_startup():
    # Ensure DB and tables exist
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/barangays", status_code=201)
def create_barangay(b: BarangayCreate):
    bid = add_barangay(b.name)
    return {"id": bid}


@app.get("/barangays", response_model=List[dict])
def get_barangays():
    return list_barangays()


@app.get("/youth", response_model=List[YouthOut])
def get_youth(barangay_id: Optional[int] = None):
    rows = list_youth(barangay_id)
    return [YouthOut(**r) for r in rows]


@app.post("/youth", status_code=201)
def create_youth(y: YouthCreate):
    try:
        # Simplified argument passing
        rid = add_youth_record(
            barangay_id=y.barangay_id,
            name=y.name,
            email=y.email,
            age=y.age,
            gender=y.gender,
            program=y.program,
            notes=y.notes
        )
        return {"id": rid}
    except IntegrityError:
        # This catches the foreign key violation
        raise HTTPException(status_code=400, detail="Barangay ID does not exist.")


@app.put("/youth/{yid}")
def put_youth(yid: int, payload: YouthUpdate):
    fields = {k: v for k, v in payload.dict().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_youth(yid, **fields)
    return {"updated": True}


@app.delete("/youth/{yid}")
def del_youth(yid: int):
    delete_youth(yid)
    return {"deleted": True}

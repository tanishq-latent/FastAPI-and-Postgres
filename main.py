# Part 1: Load DATABASE_URL from the .env file
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")



# Part 2: Create the engine (connection to PostgreSQL)
from sqlalchemy import create_engine, text, Column, String, Integer
engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    version = conn.execute(text("SELECT version()")).scalar()
    print(f"Connected to {version.split(",")[0]}")



# Part 3: Create SessionLocal and Base
from sqlalchemy.orm import DeclarativeBase, sessionmaker
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass

# Part 4: Create the StudentDB table
class StudentDB(Base):
    __tablename__ = "student_records"
    id      = Column(String, primary_key=True)
    name    = Column(String(50), nullable=False)
    age     = Column(Integer, nullable=False)
    course  = Column(String(50), nullable=False)
    marks   = Column(Integer, nullable=False)
    email   = Column(String, unique=True, nullable=False)  


#bind=engine -> every session travels to this road
Base.metadata.create_all(bind=engine)
print("Table ready...")



# Part 5: Pydantic schemas for input (StudentCreate, StudentUpdate)
from pydantic import BaseModel, Field, EmailStr, field_validator, computed_field, ConfigDict
from fastapi import HTTPException

class StudentCreate(BaseModel): #Pydantic Model
    id      : str = Field(..., examples=["S001"])
    name    : str = Field(..., min_length=2, max_length=50)
    age     : int = Field(..., gt=0, le=100)
    email   : EmailStr
    course  : str = Field(..., max_length=50)
    marks   : int = Field(..., ge=0, le=100)

    @field_validator("name")
    @classmethod
    def check_name(cls, value):
        if not value.replace(" ", "").isalpha():
            raise ValueError("Name must contain only letters and spaces")
        
        return value.title()


class StudentUpdate(BaseModel): #Pydantic Model
    name    : str | None = Field(None, min_length=2, max_length=50)
    age     : int | None = Field(None, gt=0, le=100)
    course  : str | None = Field(None, max_length=50)
    marks   : int | None = Field(None, ge=0, le=100)
    email   : EmailStr | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, value):#value="AnnayaIyer"
        if not value.replace(" ", "").isalpha():
            raise ValueError("Name must contain only letters and spaces")
        return value.title()


# Part 6: Pydantic schemas for output (StudentResponse, StudentPage, Message)
#from_attributes=True lets Pydantic read student.marks (an object), not only student["marks"]
class StudentResponse(StudentCreate):
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def grade(self) -> str:
        if self.marks >= 90:
            return "A+"
        elif self.marks >= 80:
            return "A"
        elif self.marks >= 70:
            return "B"
        elif self.marks >= 60:
            return "C"
        else:
            return "F"




# Part 7: get_db() - one session per request
#Opens a session, gives it to the endpoint, always closes it, replaces load_data/save_data

# Opens a session, pauses at yield while the endpoint doest its work and once the endpoint completed it's work the session will be closed.
def get_db():
    db = SessionLocal()
    try:
        yield db

    finally:
        db.close()



# Part 8: Create the FastAPI app
from fastapi import FastAPI, Path, Depends, Query
from sqlalchemy.orm import Session

app = FastAPI()


# Part 9: GET one student
#Depends(get_db) means: "Before running this endpoint, run the get_db() function and give me what it returns."

@app.get("/student/{student_id}", response_model=StudentResponse, tags=["GET ROUTE"])
def get_student(
    student_id : str = Path(..., description="The Id of the student"),
    db : Session = Depends(get_db)
):
    student = db.get(StudentDB, student_id)#SELECT....WHERE id="S001"
    if student is None:
        raise HTTPException(status_code=404, detail=f"Student with the Id '{student_id}' not found")
    return student
    

# Part 10: POST - create a student
from sqlalchemy.exc import IntegrityError

@app.post('/CreateStudent', response_model = StudentResponse, status_code=201, tags=["POST ROUTES"])
def create_student(student : StudentCreate,
                   db : Session = Depends(get_db)):
    if db.get(StudentDB, student.id):
        raise HTTPException(status_code = 400, detail = f"Student with the Id '{student.id}' already exists")

    new_student = StudentDB(**student.model_dump())
    db.add(new_student)

    try:
        db.commit()

    except IntegrityError:
        db.rollback() #Cancels everything the session did since the last commit()
        raise HTTPException(status_code=400, detail=f"Email '{student.email}' is already used by another student")

    db.refresh(new_student)
    return new_student



# Part 11: PUT - update a student
@app.put('/UpdateStudent/{student_id}', tags=["PUT ROUTES"])
def update_student(student_update : StudentUpdate,
                   student_id : str = Path(..., description="The Id of the student"),
                   db : Session = Depends(get_db)):
    
    student = db.get(StudentDB, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail=f"Student with the Id '{student_id}' does not exists..")

    changes = student_update.model_dump(exclude_unset=True) #only fields Sent course=Python

    for key , value in changes.items():
        setattr(student, key, value)

    try:
        db.commit()

    except IntegrityError:
            db.rollback()   #Cancels everything the session did since the last commit()
            raise HTTPException(status_code=400, detail=f"Email '{student.email}' is already used by another student")

    db.refresh(student)
    return student



# Part 12: DELETE - remove a student
@app.delete("/DeleteStudent/{student_id}", tags=["DELETE ROUTE"])
def DeleteStudent(student_id : str = Path(..., description="The Id of the student"),
                  db : Session = Depends(get_db)):
    
    student = db.get(StudentDB, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail=f"Student with the Id '{student_id}' not found")

    db.delete(student)
    db.commit()
    return {"message": f"Student '{student_id}' deleted successfully"}



# Part 13: GET all students (filter + sort + paginate)
from sqlalchemy import func

SORT_FIELDS = ["marks", "age", "name"]
SORT_ORDER  = ["asc", "desc"]

@app.get("/students", tags=["GET ROUTE"])
def get_all(
    course : str | None= Query(None, description="show only students in this course", examples=["Python"]),
    sort_by : str | None = Query(None, description="Sort by marks, age or name"),
    order : str = Query("asc", description="asc or desc", examples=["desc"]),
    page : int = Query(1, ge=1, description="Which page you want (start from 1)"),
    limit:int = Query(2, ge=1, le=100 , description= "How many students on one page (1 to 100)"),
    db : Session = Depends(get_db)
):
    if sort_by is not None and sort_by not in SORT_FIELDS:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by '{sort_by}', Choose from {SORT_FIELDS}")

    if order not in SORT_ORDER:
        raise HTTPException(status_code=400, detail=f"Invalid order '{order}', Choose from {SORT_ORDER}")

    query = db.query(StudentDB) #SELECT * FROM student_records

    if course:              #WHERE -> SELECT * FROM student_records WHERE course == "Python";
        query = query.filter(func.lower(StudentDB.course) == course.lower())

    total_students = query.count()

    if sort_by:
        column = getattr(StudentDB, sort_by)    #"marks" -> StudentDB.marks

        if order == "desc":
            query = query.order_by(column.desc())
        else:
            query = query.order_by(column.asc())

    else:
        query = query.order_by(StudentDB.id)    #Fixed Order, so pages never repeat a student

    start = (page-1) * limit #page=2,limit=2 -> start = 2
    students = query.offset(start).limit(limit).all()

    return {
        "page" : page,
        "limit" : limit,
        "total_students": total_students,
        "students" : students
    }
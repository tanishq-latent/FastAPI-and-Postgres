"""
Python will interact with PostgreSQL directly without any FastAPI routes or endpoints
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, Column, String, Integer
from sqlalchemy.orm import DeclarativeBase, sessionmaker

#STEP - 1 Get the URL from .env file
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
print(DATABASE_URL)


#STEP - 2 Engine = the road to the DATABASE
engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    version = conn.execute(text("SELECT version()")).scalar()
    print(f"Connected to {version.split(",")[0]}")


#.all() -> every row
#.first() -> only the first row
#.scalar() -> only the first value of the first row

"""
DeclarativeBase is the Parent class from SQLALchemy that turn a normal python class into a database table

Declartive : You declare(describe) what a table looks like
Base       : It's the Parent class everything else built on top of this.
"""
class Base(DeclarativeBase):
    pass

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




#Step 4: Session = One Visit, Open, do work, commit, close
SessionLocal = sessionmaker(bind=engine)

db = SessionLocal()

if db.get(StudentDB, "S001") is None:
    db.add(StudentDB(id="S001",
                     name="Aarav Sharma",
                     age=25,
                     course = "Python",
                     marks=80,
                     email="Arav@example.com"))
    db.commit()


#Read it Back
"""for i in db.query(StudentDB).all():
    print(i.id, i.name, i.age, i.marks, i.course, i.email)"""


#Update
aarav = db.get(StudentDB, "S001")
aarav.course = "Django"
db.commit()
print(aarav.marks)
print(aarav.course)
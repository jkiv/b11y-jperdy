# Parses question data (*.tsv) and saves into SQLite3 using SQLAlchemy

import argparse
import csv
from datetime import datetime
import os
import sqlalchemy
from sqlalchemy import orm
from sqlalchemy import Column, Integer, Boolean, String, Date

Base = orm.declarative_base()

class Answer(Base):
    __tablename__ = 'answers'

    id = Column(Integer, primary_key=True)
    answer_set = Column(String)
    round = Column(Integer)
    value = Column(Integer)
    daily_double = Column(Boolean)
    category = Column(String)
    comments = Column(String)
    answer = Column(String)
    question = Column(String)
    question_cleaned = Column(String)
    air_date = Column(Date)
    notes = Column(String)
    hidden = Column(Boolean, default=False)

def clean_question(original_question):
    result = original_question.strip().lower()
    # TODO filter out illegal chars
    # TODO filter out stop words
    # TODO filter out accents
    # TODO filter out options/multiple answers
    return result

def parse_tsv_file(engine, file_path):
    s = orm.Session(engine)

    new_answers = []

    # Get full path of file, answer set name
    file_path = os.path.abspath(os.path.expanduser(file_path))

    # Get name of answer set
    _, answer_set = os.path.split(file_path)

    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            new_answer = Answer()
            
            new_answer.answer_set = answer_set
            
            new_answer.round = row['round']
            new_answer.value = row['value']
            new_answer.category = row['category']
            new_answer.comments = row['comments'] if row['comments'] != '-' else None
            new_answer.answer = row['answer']
            new_answer.question = row['question']
            new_answer.question_cleaned = clean_question(row['question'])
            new_answer.notes = row['notes'] if row['notes'] != '-' else None
            new_answer.air_date = datetime.strptime(row['air_date'], '%Y-%m-%d')

            if row['daily_double'] == 'yes':
                new_answer.daily_double = True
            elif row['daily_double'] == 'no':
                new_answer.daily_double = False
            else:
                new_answer.daily_double = None

            new_answers.append(new_answer)
    
    s.bulk_save_objects(new_answers)
    s.commit()

if __name__ == '__main__':

    # Parse command line arguments
    parser = argparse.ArgumentParser(description='')
    parser.add_argument('-d', '--db', help='Path to SQL database used by SQLAlchemy.')
    parser.add_argument('file', nargs='+', help='One or more tab separated value files containing Jeopardy! answers and questions.')

    args = parser.parse_args()

    # Connect to the database
    engine = sqlalchemy.create_engine(args.db)

    # Create tables
    Base.metadata.create_all(engine)

    # Add each answer to the database
    for file_path in args.file:
        parse_tsv_file(engine, file_path)
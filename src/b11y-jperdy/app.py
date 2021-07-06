# Flask app giving access to questions, answers, and players

import argparse
import flask
from flask import jsonify
from flask_cors import CORS, cross_origin
import flask_sqlalchemy
from flask_marshmallow import Marshmallow
from sqlalchemy import Boolean, Column, Date, Integer, String
from sqlalchemy import func, select
from sqlalchemy.orm import Session

# Create the app
app = flask.Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///jeopardy_jwolle1.sqlite3'
db = flask_sqlalchemy.SQLAlchemy(app)
ma = Marshmallow(app)
cors = CORS(app)

class Answer(db.Model):
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

class AnswerSchema(ma.Schema):
    class Meta:
        fields = ('id', 'value', 'daily_double', 'category', 'answer', 'question', 'question_cleaned', 'hidden', 'notes', 'air_date', 'comments')

answer_schema = AnswerSchema()

@app.route('/answer/<id>', methods=['GET'])
def get_answer_by_id(id):
    answer = Answer.query.filter_by(id=id).first()

    if answer:
        return answer_schema.dump(answer)
    else:
        return 'No answer for provided `id`.', 404

@app.route('/answer', methods=['GET'])
@cross_origin()
def get_random_answer():
    answer = Answer.query.filter_by(hidden=False).order_by(func.random()).first()

    if answer:
        return answer_schema.dump(answer)
    else:
        return 'Unable to produce a random answer.', 404

@app.route('/answer/<id>', methods=['PUT'])
def unhide_answer(id):
    answer = Answer.query.filter_by(id=id).first()

    if answer:
        answer.hidden = False
    
        db.session.add(answer)
        db.session.commit()

        return answer_schema.dump(answer)
    else:
        return 'No answer for provided `id`.', 404

@app.route('/answer/<id>', methods=['DELETE'])
def hide_answer(id):
    answer = Answer.query.filter_by(id=id).first()

    if answer:
        answer.hidden = True
    
        db.session.add(answer)
        db.session.commit()

        return answer_schema.dump(answer)
    else:
        return 'No answer for provided `id`.', 404

@app.route('/<channel>/<player>/<points>', methods=['PUT'])
@cross_origin()
def add_player_points(channel, player, points):
    # TODO
    return '', 501

@app.route('/<channel>/<player>/<points>', methods=['DELETE'])
def remove_player_points(points):
    # TODO
    return '', 501

if __name__ == '__main__':
    # Make rocket go now!
    app.run()
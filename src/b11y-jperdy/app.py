# Flask app giving access to questions, answers, and players

import argparse
import flask
import json
from flask import jsonify, request
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

class Score(db.Model):
    __tablename__ = 'score'

    channel = Column(String, primary_key=True)
    player = Column(String, primary_key=True)
    score = Column(Integer)

class ScoreSchema(ma.Schema):
    class Meta:
        fields = ('channel', 'player', 'score')

score_schema = ScoreSchema()

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

@app.route('/score/<channel>/<player>', methods=['PUT'])
@cross_origin()
def update_player_score(channel, player):

    # Get points delta from JSON payload
    payload = json.loads(request.data)
    # TODO what to do with payload['channel'], payload['points']
    amount = int(payload['amount'])

    # Find player's current total
    player_total = Score.query.filter_by(channel=channel, player=player).first()

    if player_total is not None:
        # Update player_total
        player_total.score += amount
    else:
        # Create player_total
        player_total = Score()
        player_total.channel = channel
        player_total.player = player
        player_total.score = amount
    
    db.session.add(player_total)
    db.session.commit()

    return score_schema.dump(player_total)

if __name__ == '__main__':
    # Make rocket go now!
    app.run()
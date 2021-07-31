
var jperdy = jperdy || {};

(function(context) {

    context.timeouts = context.timeouts || {};
    context.state    = context.state    || {};
    context.mqtt     = context.mqtt     || {};

    context.channel_name = null;

    context.CATEGORY_TIMEOUT_MS     =  3000;
    context.VALUE_TIMEOUT_MS        =  2000;
    context.ANSWER_TIMEOUT_MS       = 30000;
    context.QUESTION_TIMEOUT_MS     =  5000;
    context.WINNER_TIMEOUT_MS       =  5000;
    context.WINNER_TOTAL_TIMEOUT_MS =  5000;

    // FIXME specify the base URL
    context.RANDOM_QUESTION_URI = 'http://localhost:5000/answer';
    context.PLAYER_POINTS_URI   = 'http://localhost:5000/score/{{channel}}/{{player}}'

    context.TOPIC_ALL           = '{{prefix}}/j/{{channel}}/*';
    context.TOPIC_START_ROUND   = '{{prefix}}/j/{{channel}}/start_round';
    context.TOPIC_ROUND_STARTED = '{{prefix}}/j/{{channel}}/round_started';
    context.TOPIC_GUESS         = '{{prefix}}/j/{{channel}}/guess';
    context.TOPIC_END_ROUND     = '{{prefix}}/j/{{channel}}/end_round';

    context.topic_prefix = 'b11y';
    context.topics = {};

    context.mqtt.initialize = function(hostname, port, server_path, client_id) {
        context.mqtt.client = new Paho.MQTT.Client(hostname, port, server_path, client_id);
        context.mqtt.client.onMessageArrived  = context.mqtt.on_message;
    }

    context.mqtt.on_connect = function() {
        console.log("[jperdy] MQTT connected.");

        if (context.topics.all === undefined) {
            console.error("[jperdy] No channel name set. Could not subscribe to channel messages.");
            return;
        }

        context.mqtt.subscribe(context.topics.all);
    }

    context.mqtt.on_disconnect = function(responseObject) {
        // FIXME not used?
        console.log("[jperdy] MQTT disconnected... (" + responseObject.errorMessage + ")");

        // Reconnect
        context.mqtt.connect(
            context.mqtt.auth.username,
            context.mqtt.auth.password,
            context.mqtt.auth.useSSL
        );
    }

    context.mqtt.connect = function(username, password, useSSL=false) {
        console.log("[jperdy] MQTT connecting as '" + username + "'...");

        context.mqtt.auth = context.mqtt.auth || {};
        context.mqtt.auth.username = username;
        context.mqtt.auth.password = password;
        context.mqtt.useSSL = useSSL;
        
        context.mqtt.client.connect({
            userName: context.mqtt.auth.username,
            password: context.mqtt.auth.password,
            useSSL: context.mqtt.useSSL,
            onSuccess: context.mqtt.on_connect
        });
    }

    context.mqtt.subscribe = function(topic) {
        console.log("[jperdy] MQTT - Subscribing to '" + topic + "'");
        context.mqtt.client.subscribe(topic);
    }

    context.mqtt.send = function(topic, payload) {
        message = new Paho.MQTT.Message(payload);
        message.destinationName = topic;
        context.mqtt.client.send(message);
    }

    context.mqtt.on_message = function(message) {
        console.log('[jperdy] MQTT message received: topic=' + message.destinationName + ', payload=' + message.payloadString);

        // TODO move these functions out of here

        // Handle messages in IDLE state
        handle_idle = function(message) {
            topic = message.destinationName;
            payload = message.payloadString;

            switch(topic) {
                case context.topics.start_round:
                    // Unpack payload
                    payload = JSON.parse(payload);

                    channel = payload.channel;
                    username = payload.username;

                    context.start_round(channel, username);
                    break;
                default:
                    // ...
            }
        }

        // Handle messages in ACCEPTING_QUESTIONS state
        handle_accepting_questions = function(message) {
            topic = message.destinationName;
            payload = message.payloadString;

            switch(topic) {
                case context.topics.guess:
                    // Unpack payload
                    payload = JSON.parse(payload);

                    channel = payload.channel;
                    username = payload.username;
                    guess = payload.guess;

                    context.on_guess(channel, username, guess);
                    break;
                default:
                    // ...
            }
        }

        // Handle incoming messaged based on current game state

        console.log('[jperdy] Current state: ' + context.state);

        try {
            switch(context.state)
            {
                case context.states.IDLE:
                    handle_idle(message);
                    break;
                case context.states.ACCEPTING_QUESTIONS:
                    handle_accepting_questions(message);
                    break;
                default:
                    // (do nothing)
            }
        }
        catch(e) {
            console.error("[jperdy] Error while handling MQTT message received.", e);
        }

    }
    
    context._set_game_text = function(text_unsafe) {
        // Escape unsafe text  (TODO use more robust method?)
        text_safeish = text_unsafe.replace(/&/g, "&amp;")
                                  .replace(/</g, "&lt;")
                                  .replace(/>/g, "&gt;")
                                  .replace(/"/g, "&quot;")
                                  .replace(/'/g, "&#039;");

        container = document.getElementById('jperdy-text');
        container.innerHTML = text_safeish;
    }

    context._show_background = function(show) {
        if (show) {
            document.body.classList.add('jperdy-active');
        }
        else {
            document.body.classList.remove('jperdy-active');
        }
    }

    context._update_topics = function(channel_name) {
        
        const prefix = context.topic_prefix;

        context.topics = {
            all:           context.TOPIC_ALL.replace(/{{prefix}}/g, prefix).replace(/{{channel}}/g, channel_name),
            start_round:   context.TOPIC_START_ROUND.replace(/{{prefix}}/g, prefix).replace(/{{channel}}/g, channel_name),
            round_started: context.TOPIC_ROUND_STARTED.replace(/{{prefix}}/g, prefix).replace(/{{channel}}/g, channel_name),
            guess:         context.TOPIC_GUESS.replace(/{{prefix}}/g, prefix).replace(/{{channel}}/g, channel_name),
            end_round:     context.TOPIC_END_ROUND.replace(/{{prefix}}/g, prefix).replace(/{{channel}}/g, channel_name)
        }
    }

    context.set_channel = function(channel_name) {
        context.channel_name = channel_name;
        context._update_topics(channel_name);
    }

    context.set_topic_prefix = function(topic_prefix) {
        context.topic_prefix = topic_prefix;
    }

    context.reset_game_state = function() {
        // Clear the screen
        console.log("[jperdy] Resetting game state to IDLE...");
        context._set_game_text('');
        context._show_background(false);

        // Clear round context
        context.round_info = {
            answer: null,
            initiator: null,
            channel: null
        };

        context.state = context.states.IDLE;
    }

    context.start_round = function(channel, username) {
        
        if (channel != context.channel_name) {
            console.log("[jperdy] Ignoring message for channel '" + channel + "'");
            return;
        }

        if (context.state != context.states.IDLE) {
            console.log("[jperdy] Cannot start round while round in progress...");
            return;
        }

        console.log("[jperdy] Round initiated by '" + username + "' in '" + channel + "'");

        // Save the round state
        context.round_info = {
            channel: channel,
            initiator: username,
            answer: null
        };

        // Update state
        context.state = context.states.FETCHING_ANSWER;

        fetch(context.RANDOM_QUESTION_URI) // Get random question
            .then(response => {
                console.log(response);

                // Check response status
                if (!response.ok) {
                    console.log('[jperdy] Could not retreive random question from ' + context.RANDOM_QUESTION_URI, reponse);
                    throw new Error('Could not retreive random question from ' + context.RANDOM_QUESTION_URI);
                }

                return response.text();
            })
            .then(response_body => {                
                // Unpack answer
                answer = JSON.parse(response_body);
                context.round_info.answer = answer;

                console.log('[jperdy] New answer: ', answer);

                // Enable background colour
                context._show_background(true);

                // Show category
                console.log("[jperdy] Displaying category, '" + answer.category + "'");
                context._set_game_text(answer.category);

                // Send MQTT response
                // FUTURE choose what to send over
                payload = { channel: channel, answer: answer };
                context.mqtt.send(context.topics.round_started, JSON.stringify(payload));

                // Start timeout
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      resolve();
                    }, context.CATEGORY_TIMEOUT_MS);
                });
            })
            .then(() => {
                // Show value
                console.log("[jperdy] Displaying value, $" + context.round_info.answer.value);
                context._set_game_text('$' + context.round_info.answer.value);

                // Start timeout
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      resolve();
                    }, context.VALUE_TIMEOUT_MS);
                });
            })
            .then(() => {
                // Show answer
                console.log("[jperdy] Displaying answer, '" + context.round_info.answer.answer + "'");
                context._set_game_text(context.round_info.answer.answer);

                // Update state
                context.state = context.states.ACCEPTING_QUESTIONS;

                // Start timeout
                context.timeouts.answer = setTimeout(context.on_round_timeout, context.ANSWER_TIMEOUT_MS);
            })
            .catch(error => {
                console.error("[jperdy] Error while handling round start.", error);
                context.reset_game_state();
            });
    }

    context.on_round_timeout = function() {
        console.log("[jperdy] Round time-out!");

        if (context.state != context.states.ACCEPTING_QUESTIONS) {
            console.error("[jperdy] Round time-out occured but in wrong state. state = " + context.state);
            return;
        }

        // Update state
        context.state = context.states.QUESTION_TIMEOUT;

        // Kick of MQTT message
        context.mqtt.send(context.topics.end_round, JSON.stringify({
            channel: channel,
            username: '',
            answer: context.round_info.answer,
        }));

        (function() {
            // Show message
            console.log("[jperdy] Showing question, '" + context.round_info.answer.question + "'");
            context._set_game_text(context.round_info.answer.question);

            return new Promise((resolve, reject) => {
                setTimeout(() => {
                  resolve();
                }, context.QUESTION_TIMEOUT_MS);
            });
        })()
        .then(context.reset_game_state)
        .catch(error => {
            console.error("[jperdy] Error while handling round time-out.", error);
            context.reset_game_state();
        });
    }

    context.on_guess = function(channel, username, guess) {

        // TODO Fair, fuzzy matching
        is_guess_close_enough = function(guess, question) {
            guess = guess.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            question = question.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

            console.log("[jperdy] Checking guess = '" + guess + "' against question = '" + question + "'");

            return (guess === question);
        }

        // Test `guess` against `question_cleaned`
        if (!is_guess_close_enough(guess, context.round_info.answer.question_cleaned)) {
            console.log("[jperdy] Guess '" + guess + "' was deemed incorrect.");
            return; // Incorrect guess
        }

        // Correct guess
        context.state = context.states.CORRECT_GUESS;

        // Stop answer/question timeout
        clearTimeout(context.timeouts.answer);

        // Update screen with user's name
        (function() {
            // Show answer
            console.log("[jperdy] Showing question, '" + context.round_info.answer.question + "'");
            context._set_game_text(context.round_info.answer.question);

            return new Promise((resolve, reject) => {
                setTimeout(() => {
                  resolve();
                }, context.QUESTION_TIMEOUT_MS);
            });
        })()
            .then(() => {
                // Show winner and new total
                console.log("[jperdy] Showing winner, '" + username + "'");
                context._set_game_text(username);

                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve();
                    }, context.WINNER_TIMEOUT_MS);
                });
            })
            .then(() => {
                // Update player total in channel, returns new player total

                uri = context.PLAYER_POINTS_URI
                uri = uri.replace('{{channel}}', encodeURI(channel));
                uri = uri.replace('{{player}}', encodeURI(username));
                
                payload = {
                    amount: context.round_info.answer.value
                };

                return fetch(uri, {
                    method: 'PUT',
                    //mode: 'cors', // no-cors, *cors, same-origin
                    //credentials: 'same-origin', // include, *same-origin, omit
                    cache: 'no-cache',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
            })
            .then(response => {

                // Check response status
                if (!response.ok) {
                    console.log('[jperdy] Could not update points for player.', reponse);
                }

                return response.json();
            })
            .then(response => {

                // Show winner and new total
                console.log("[jperdy] Showing winner's new total, $" + response.score + "'");
                context._set_game_text('$' + response.score);

                // Kick of MQTT message
                context.mqtt.send(context.topics.end_round, JSON.stringify({
                    channel: channel,
                    username: username,
                    score: '$' + response.score,
                    answer: context.round_info.answer,
                }));

                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve();
                    }, context.WINNER_TOTAL_TIMEOUT_MS);
                });
            })
            .then(() => {
                context.reset_game_state();
            })
            .catch(error => {
                console.error("[jperdy] Error while handling round end.", error);
                context.reset_game_state();
            });
    }

    context.states = {
        IDLE: 'IDLE',
        START_ROUND: 'START_ROUND',
        FETCHING_ANSWER: 'FETCHING_ANSWER',
        ACCEPTING_QUESTIONS: 'ACCEPTING_QUESTIONS',
        QUESTION_TIMEOUT: 'QUESTION_TIMEOUT',
        CORRECT_GUESS: 'CORRECT_GUESS'
    };

    context.state = context.states.IDLE;

})(jperdy);
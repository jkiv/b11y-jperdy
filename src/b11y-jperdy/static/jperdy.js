
var jperdy = jperdy || {};

(function(context) {

    context.timeouts = context.timeout || {};
    context.state = context.state || {};
    context.mqtt = context.mqtt || {};

    context.CATEGORY_TIMEOUT_MS = 3000;
    context.VALUE_TIMEOUT_MS = 2000;
    context.ANSWER_TIMEOUT_MS = 60000;
    context.QUESTION_TIMEOUT_MS = 5000;
    context.WINNER_TIMEOUT_MS = 5000;

    context.RANDOM_QUESTION_URI = 'http://localhost:5000/answer';

    context.mqtt.initialize = function(hostname, port, server_path, client_id) {
        context.mqtt.client = new Paho.MQTT.Client(hostname, port, server_path, client_id);
        context.mqtt.client.onMessageArrived  = context.mqtt.on_message;
    }

    context.mqtt.on_connect = function() {
        console.log("[MQTT] Connected.");
        context.mqtt.subscribe("b11y/j/*");
    }

    context.mqtt.on_disconnect = function(responseObject) {
        console.log("[MQTT] Disconnected... (" + responseObject.errorMessage + ")");

        // Reconnect
        context.mqtt.connect(
            context.mqtt.auth.username,
            context.mqtt.auth.password,
            context.mqtt.auth.useSSL
        );
    }

    context.mqtt.connect = function(username, password, useSSL=false) {
        console.log("[MQTT] Connecting as '" + username + "'...");

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
        console.log("[MQTT] Subscribing to '" + topic + "'");
        context.mqtt.client.subscribe(topic);
    }

    context.mqtt.on_message = function(message) {
        console.log('[MQTT] Message received: topic=' + message.destinationName + ', payload=' + message.payloadString);

        handle_idle = function(message) {
            topic = message.destinationName;
            payload = message.payloadString;

            switch(topic) {
                case 'b11y/j/start_round':
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

        handle_guesses = function(message) {
            topic = message.destinationName;
            payload = message.payloadString;

            switch(topic) {
                case 'b11y/j/guess':
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
        switch(context.state)
        {
            case context.states.IDLE:
                handle_idle(message);
                break;
            case context.states.ACCEPTING_QUESTIONS:
                handle_guesses(message);
            default:
                // (do nothing)
        }

        console.log('[jperdy] Current state: ' + context.state);

    }

    context.start_round = function(channel, username) {
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
                    throw new Error('Network response was not ok');
                }

                return response.text();
            })
            .then(response_body => {
                console.log(response_body);
                
                // Unpack answer
                answer = JSON.parse(response_body);
                context.round_info.answer = answer;

                // Show category
                console.log("Showing category: " + answer.category.toUpperCase());
                container = document.getElementById('jperdy-text');
                container.innerHTML = answer.category.toUpperCase();
                // TODO set background-color: jeopardy-blue

                // Send MQTT response
                // TODO

                // Start timeout
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      resolve();
                    }, context.CATEGORY_TIMEOUT_MS);
                });
            })
            .then(() => {

                // Show value
                console.log("Showing value: " + context.round_info.answer.value);
                container = document.getElementById('jperdy-text');
                container.innerHTML = '$' + context.round_info.answer.value;

                // Start timeout
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                      resolve();
                    }, context.VALUE_TIMEOUT_MS);
                });
            })
            .then(() => {
                // Show answer
                console.log("Showing answer: " + context.round_info.answer.answer);
                container = document.getElementById('jperdy-text');
                container.innerHTML = context.round_info.answer.answer;

                // Update state
                context.state = context.states.ACCEPTING_QUESTIONS;

                // Start timeout
                context.timeouts.answer = setTimeout(context.on_question_timeout, context.ANSWER_TIMEOUT_MS);
            })
            .catch(error => {
                context.state = context.states.IDLE;
                console.error('There has been a problem with your fetch operation:', error);
            });
    }

    context.on_question_timeout = function() {
        console.log("Answer timeout! (state=" + context.state + ")");

        if (context.state != context.states.ACCEPTING_QUESTIONS) {
            console.log("Not in correct state.");
            return;
        }

        // Update state
        context.state = context.states.QUESTION_TIMEOUT;

        (function() {
            // Show message
            console.log("Showing answer");
            container = document.getElementById('jperdy-text');
            container.innerHTML = context.round_info.answer.question;

            return new Promise((resolve, reject) => {
                setTimeout(() => {
                  resolve();
                }, context.QUESTION_TIMEOUT_MS);
            });
        })()
            .then(() => {
                // Clear the screen
                console.log("Clearing screen.");
                container = document.getElementById('jperdy-text');
                container.innerHTML = '';
                // TODO background-color = none

                // Clear round context
                context.round_info = {
                    answer: null,
                    initiator: null,
                    channel: null
                };
                context.state = context.states.IDLE;
            });
    }

    context.on_guess = function(channel, username, guess) {

        is_guess_close_enough = function(guess, question) {
            // TODO properly
            guess = guess.replace(/[^a-zA-Z0-9]/g, '');
            question = question.replace(/[^a-zA-Z0-9]/g, '');

            console.log("guess=" + guess + ", question=" + question);

            return (guess == question);
        }

        // Test `guess` against `question_cleaned`
        if (!is_guess_close_enough(guess, context.round_info.answer.question_cleaned)) {
            return; // Incorrect guess
        }

        // Correct guess
        context.state = context.states.CORRECT_GUESS;

        // Kick of MQTT message
        // TODO

        // Stop answer/question timeout
        clearTimeout(context.timeouts.answer);

        // Update screen with user's name
        (function() {
            // Show answer
            console.log("Showing answer");
            container = document.getElementById('jperdy-text');
            container.innerHTML = context.round_info.answer.question;

            return new Promise((resolve, reject) => {
                setTimeout(() => {
                  resolve();
                }, context.QUESTION_TIMEOUT_MS);
            });
        })()
            .then(() => {
                // Show winner
                console.log("Showing winner");
                container = document.getElementById('jperdy-text');
                container.innerHTML = username;

                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                    resolve();
                    }, context.WINNER_TIMEOUT_MS);
                });
            })
            .then(() => {
                // Clear the screen
                console.log("Clearing screen.");
                container = document.getElementById('jperdy-text');
                container.innerHTML = '';
                // TODO background-color = none

                console.log("Player \'"+username+"\' +$"+context.round_info.answer.value.toString());
                // TODO return fetch(context.UPDATE_PLAYER_POINTS_URI)
                
                // Clear round context
                context.state = context.states.IDLE;
                context.round_info = {
                    answer: null,
                    initiator: null,
                    channel: null
                };
            });
    }

    context.states = {
        IDLE: 'IDLE',
        START_ROUND: 'START_ROUND',
        FETCHING_ANSWER: 'FETCHING_ANSWER',
        ACCEPTING_QUESTIONS: 'ACCEPTING_QUESTIONS',
        QUESTION_TIMEOUT: 'QUESTION_TIMEOUT',
        CORRECT_GUESS: 'CORRECT_GUESS',
        // ...
    };

    context.state = context.states.IDLE;

})(jperdy);


// > Start message
// < Question info
// > Wager (daily double)
// > Guesses
// < Round done (correct guess or timeout)
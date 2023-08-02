import { vcr, Voice, State } from "@vonage/vcr-sdk";
import express from "express";
import pug from 'pug';
import fs from 'fs';
import fetch from 'node-fetch';

const app = express();
const port = process.env.NERU_APP_PORT;

const speechData = loadSpeechData();
const voiceListener = new Voice(vcr.getGlobalSession());

let currentLevel = 0;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

await voiceListener.onCall("onCall");

app.get('/_/health', async (req, res) => {
    res.sendStatus(200);
});

app.get('/', async (req, res, next) => {
    try {
        res.send(pug.renderFile('public/index.pug', { number: process.env.VONAGE_NUMBER, level: "0"}));
    } catch (e) {
        next(e);
    }
});

app.post('/level', async (req, res) => {
    try {
        currentLevel = req.body.level;
        res.send(pug.renderFile('public/index.pug', { number: process.env.VONAGE_NUMBER, level: currentLevel}));
    } catch (e) {
        next(e);
    }
});

app.post('/onCall', async (req, res, next) => {
    try {
        const session = vcr.createSession();
        const state = new State(session);
        const voice = new Voice(session);

        await state.set('region', req.body.region_url);

        await voice.onCallEvent({ vapiID: req.body.uuid, callback: 'onEvent' });

        const number = req.body.from;
        const insights = await fetchInsights(number);
        const score = insights.fraud_score.risk_score;    
        if(score <= 100 - 10*currentLevel){
            res.json([
                {
                    action: 'talk',
                    text: speechData.message,
                    language: "en-US"
                },
                {
                    action: 'talk',
                    text: speechData.success,
                    language: "en-US"
                },
                {
                    action: 'record',
                    format: "ogg",
                    endOnSilence: 3, 
                    endOnkey: "#",
                    timeOut:10,
                    beepStart: true
                },
                {
                    action: 'talk',
                    text: speechData.end,
                    language: "en-US"
                }
            ]);
        } else {
            res.json([
                {
                    action: 'talk',
                    text: speechData.message,
                    language: "en-US"
                },
                {
                    action: 'talk',
                    text: speechData.error,
                    language: "en-US"
                }
            ]);
        }
    } catch (e) {
        next(e);
    }
});


app.post('/onEvent', async (req, res, next) => {
    console.log(req.body);
    res.sendStatus(200);
  
});

async function fetchInsights(number) {
    const data = {
        type: 'phone',
        phone: number,
        insights: [
            "fraud_score"
        ]
    };

    try {
        const response = await fetch(
            'https://api.nexmo.com/v2/ni',
            { 
            method: 'POST', 
            body: JSON.stringify(data), 
            headers: {
                'Authorization': `Bearer ${generateJWT()}`,
                'Content-Type': 'application/json'
            }
            }
        );

        const responseData = await response.json();
        return responseData;
    } catch (e) {
        console.log(e);
    }
}

function generateJWT() {
    const nowTime = Math.round(new Date().getTime() / 1000);
    const token = vcr.createVonageToken({exp: nowTime + 86400});
    return token;
}

function loadSpeechData() {
    const data = fs.readFileSync('./speech.json');
    let obj = JSON.parse(data);
    return obj;
}

app.listen(port, () => {
    console.log(`App listening on port ${port}`)
});

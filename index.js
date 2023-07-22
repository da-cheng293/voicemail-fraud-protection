import { vcr, Voice, State } from "@vonage/vcr-sdk";
import express from "express";
import pug from 'pug';
import fs from 'fs';
import util from 'util';

const app = express();
const port = process.env.NERU_APP_PORT;

const speechData = loadSpeechData();

const instanceState = vcr.getInstanceState();
const voiceListener = new Voice(vcr.getGlobalSession());

let currentLevel = 100;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

await voiceListener.onCall("onCall");

app.get('/_/health', async (req, res) => {
    res.sendStatus(200);
});

app.get('/', async (req, res, next) => {
    try {
        res.send(pug.renderFile('public/index.pug', { number: process.env.VONAGE_NUMBER}));
    } catch (e) {
        next(e);
    }
});

app.post('/level', async (req, res) => {
    try {
        await instanceState.set('level', req.body.level);
        currentLevel = req.body.level;
        res.redirect('/');
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

    // console.log("---------------------------------------------------")
    //     console.log(util.inspect(req.body, false, null, true /* enable colors */))

    //     console.log("---------------------------------------------------")

        
        const number = req.body.from;
        console.log("test number"+number);
        const insights = await fetchInsights(number);
        const score = insights.fraud_score.risk_score;
        console.log("fraud_score: "+insights.fraud_score.risk_score);
    
    if(score <= currentLevel){

    
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
                action: 'input',
                type: ['speech'],
                speech: {
                    language: "en-US",
                }
            }
        ]);
    }
    else {
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
    try {
        const session = vcr.getSessionFromRequest(req);
        const state = new State(session);
        
        const regionUrl = await state.get('region');

        if (req.body.hasOwnProperty('speech') && regionUrl) {
            if (req.body.speech.hasOwnProperty('error')) {
                res.json([
                    {
                        action: 'talk',
                        text: speechData.success,
                        language: "en-US"
                    },
                    {
                        action: 'input',
                        type: ['speech'],
                        speech: {
                            language: "en-US",
                        }
                    }
                ]);
            } else if (req.body.speech.hasOwnProperty('results')) {
                let text = req.body.speech.results[0].text;
                if (text) {
                    res.json([
                        {
                            action: 'talk',
                            text: speechData.repeat,
                            language: "en-US"
                        },
                        {
                            action: 'talk',
                            text: text,
                            language: "en-US"
                        },
                   
                    ]);
                }
            }
        } else {
            console.log(req.body);
            res.sendStatus(200);
        }
    } catch (e) {
        next(e);
    }
});

async function fetchInsights(number) {
  const data = {
      type: 'phone',
      phone: number,
      insights: [
        "fraud_score",
        "sim_swap"
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

//Imports
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
const dns = require('node:dns')
// const { body , validationResult } = require('express-validator')
// const { json } = require('body-parser');

//mongoDB connection
const mongoose = require('mongoose');
mongoose.connect(`mongodb+srv://DefaultUser:${process.env.PASSWORD}@cluster0.4qznb9j.mongodb.net/?retryWrites=true&w=majority`, {useNewUrlParser: true, useUnifiedTopology: true});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log("Connected to MongoDB!");
});

// Basic Express Configuration
const port = process.env.PORT || 3000;
app.use(cors());
app.use('/public', express.static(`${process.cwd()}/public`));
app.get('/', function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});


//Mongo Schema / Model
const UrlSchema = new mongoose.Schema({
  original_url : String,
  short_url : Number
})
const UrlModel = mongoose.model('UrlModel', UrlSchema);


//On load, search db for highest value of shortUrl to avoid shortUrl overlaps
let shortUrlCount;
async function findUrlCount() { await UrlModel.aggregate([
    {$group: { _id: null, maxShortUrl: { $max: "$short_url" } } }
  ], (err, result) => {
    if (err) {
      console.log("Could not load short_url");
      console.log("short_url reset to 0");
      shortUrlCount = 0;
      return;
    }
    console.log("DB search succes! Current shortUrl value:", result[0].maxShortUrl)
    shortUrlCount = result[0].maxShortUrl;
    return;
  })
}
findUrlCount();


//Endpoints
app.post(
  '/api/shorturl', 
  (req, res, next) => {
    //Validate url format
    let postUrl;
    try {
      postUrl = new URL(req.body.url);
      console.log('Url parse success')
      // console.log("PARSED URL:", postUrl)
    }
    catch {
      return res.json({ error: 'invalid url' })
    }

    //Check if host exists
    const options = {
      family: 6,
      hints: dns.ADDRCONFIG | dns.V4MAPPED,
    };
    dns.lookup(postUrl.hostname, options, (err, address, family) => {
    if (err) {
      console.log("DNS lookup failed. Error code:", err.code);
      return res.json({ error: 'invalid url' })
      }
    console.log('Host address: %j family: IPv%s', address, family);
    next();
    });
  },
  (req, res) => {
    const urlModel = new UrlModel({
      original_url : req.body.url, 
      short_url : shortUrlCount + 1 //shortUrl is one greater than max value in db
  });

  console.log(urlModel);
  urlModel.save((error, savedDocument) => {
    if (error) {
      return res.status(500).send(error);
    }
    // Increment shortUrl on succesful save
    shortUrlCount++
    // Return a success response
    res.json({
      original_url : req.body.url,
      short_url : shortUrlCount
    });
    // res.json(savedDocument);
  })
})

app.get('/api/shorturl/:short', 
  (req, res, next) => {
    console.log(req.params.short, typeof(req.params.short), Number.isNaN(req.params.short))
    if (Number.isNaN(Number(req.params.short))) {
      console.log("Invalid shorturl format", Number(req.params.short))
      return res.json({error : 'invalid url format'});
    }
    if (Number(req.params.short) > shortUrlCount) {
      console.log("Requested shorturl does not exist")
      return res.json({error : 'invalid url'});
    }

    else {
      console.log("--------------------middleware complete")
      next();
    }
  },
  (req, res) => {
    //Decode short from url and validate
    //Search db for short_url key
    UrlModel.findOne({ short_url : req.params.short }, (error, savedDocument) => {
      if (error) {
        console.log("Error finding short_url:", error)
        // next(error);
        res.send(error)
      }
      //Redirect to corresponding original_url
      res.redirect(savedDocument.original_url)
    })
  })


app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});

const SERVER_PORT = 8001;
const express = require("express");
const app = express();
const cors = require("cors");
const AWS = require("aws-sdk");
AWS.config.update({
    region: 'us-east-1'
});

const AWS_BUCKET = "csu44000assign2useast20";
const AWS_FILENAME = "moviedata.json";
const TABLE = "Movies";

const s3 = new AWS.S3();

//dynamoDB boilerplate
const bucketParams = {
    Bucket: AWS_BUCKET,
    Key: AWS_FILENAME
};

let dynamoDB = new AWS.DynamoDB();
let dbParams = {
    TableName: TABLE,
    KeySchema: [
        { AttributeName: "year", KeyType: "HASH" },  //Partition key
        { AttributeName: "title", KeyType: "RANGE" }  //Sort key
    ],
    AttributeDefinitions: [
        { AttributeName: "year", AttributeType: "N" },
        { AttributeName: "title", AttributeType: "S" }
    ],
    BillingMode: "PAY_PER_REQUEST"
};

app.use(cors()); //Allow cross origin requests for local development
app.use(express.static('public')); //serve the webpage

//this feature is coming natively in Express 5
//Express 5 is currently in Alpha so this will do for now
//catches async errors and passes them to the error handling fn defined at the end
function asyncErrWrapper(asyncFun) {
    return function (req, res, next) {
        asyncFun(req, res, next).catch(next);
    };
}

//returns a promise object from the s3 bucket
function getFromS3Bucket() {
    return s3.getObject(bucketParams).promise();
}

//write the object to the db
function writeToDynamo(movieData) {
    let docClient = new AWS.DynamoDB.DocumentClient();
    movieData.map(function (movie) {
        let params = {
            TableName: TABLE,
            Item: {
                "year": movie.year,
                "title": movie.title,
                "info": movie.info
            }
        };
        return docClient.put(params, function (err, data) {
            if (err) {
                console.error("Unable to add movie", movie.title, ". Error JSON:", JSON.stringify(err, null, 2));
            }
        }).promise();
    });
    return movieData;
}

//deletes the table in the database
function deleteDynamo() {
    return dynamoDB.deleteTable({ TableName: TABLE }).promise();
}

//create a database
function createDynamo() {
    return dynamoDB.createTable(dbParams).promise();
}

//this is required because dynamodb creation is weird
//the response a request is immediately resolved but the response object changes state
//read more here: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html
function waitUntilDynamoActionStatusOrFailed(pendingstatus, successStatus, loopTimeMs) {
    return new Promise(async (resolve, reject) => {
        let tableState, tableStatusWord;
        do {
            await new Promise(resolve => setTimeout(resolve, loopTimeMs));
            //get the current state of the DB
            tableState = await dynamoDB.describeTable({ TableName: TABLE }).promise()
            tableStatusWord = tableState?.Table?.TableStatus
        } while (tableStatusWord === pendingstatus);
        if (tableStatusWord === successStatus)
            resolve();
        reject();
    });
}

//querys the database
function queryDB(year, title) {
    let queryParams = {
        TableName: TABLE,
        KeyConditionExpression: "#yr = :yyyy and begins_with(title, :titleStart)",
        ExpressionAttributeNames: {
            "#yr": "year"
        },
        ExpressionAttributeValues: {
            ":yyyy": year,
            ":titleStart": title
        }
    };

    let docClient = new AWS.DynamoDB.DocumentClient();
    return docClient.query(queryParams).promise();
}

app.get("/movie", asyncErrWrapper(async (req, res) => {
    let dbRes = await queryDB(Number(req.query.year), req.query.title);
    res.send(dbRes.Items);
}));

app.delete("/database", asyncErrWrapper(async (_, res) => {
    console.log("Deleting Database");
    await deleteDynamo();
    waitUntilDynamoActionStatusOrFailed("DELETING", "", 200).catch();
    console.log("Database deleted");
    res.status(200).send("Database deleted");
}));

app.post("/database", asyncErrWrapper(async (_, res, next) => {
    console.log("Creating Database");
    await createDynamo();
    await waitUntilDynamoActionStatusOrFailed("CREATING", "ACTIVE", 1000);
    let response_json = JSON.parse((await getFromS3Bucket()).Body);
    await Promise.all(writeToDynamo(response_json));
    console.log("Database Created!");
    res.status(200).send("Database Created!");
}));

//handles async errors
app.use((err, req, res, next) => {
    console.error(err);
    if (err?.message.startsWith("Table already exists"))
        return res.status(210).send("Table already exists");
    else if (err?.message.startsWith("Requested resource not found: Table:"))
        return res.status(210).send("Table already deleted");
    res.status(500).send(err);
});

app.listen(SERVER_PORT, () => console.log(`Server running on port: ${SERVER_PORT}`));
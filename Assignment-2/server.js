const SERVER_PORT = 8001;
const express = require("express");
const app = express();
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

app.use(express.static('public')); //serve the webpage

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

app.get("/movie", async (req, res) => {
    let dbRes = await queryDB(Number(req.query.year), req.query.title);
    res.send(dbRes.Items);
});

app.delete("/database", async (_, res) => {
    console.log("Deleting Database");
    await dynamoDB.deleteTable({ TableName: TABLE }).promise();
    await dynamoDB.waitFor("tableNotExists", {TableName: TABLE}).promise();
    console.log("Database deleted");
    res.status(200).send("Database deleted");
});

app.post("/database", async (_, res, next) => {
    console.log("Creating Database");
    await dynamoDB.createTable(dbParams).promise();
    await dynamoDB.waitFor("tableExists", {TableName: TABLE}).promise();
    let response_json = JSON.parse((await getFromS3Bucket()).Body);
    await Promise.all(writeToDynamo(response_json));
    console.log("Database Created!");
    res.status(200).send("Database Created!");
});

app.listen(SERVER_PORT, () => console.log(`Server running on port: ${SERVER_PORT}`));


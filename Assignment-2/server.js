const SERVER_PORT = 5501;
const app = require("express")();
const cors = require("cors");
const fs = require("fs");
const util = require('util');
const AWS = require("aws-sdk");
AWS.config.update({
    region: 'us-east-1',
    endpoint: "http://localhost:8000"
});

const AWS_BUCKET = "csu44000assign2useast20";
const AWS_FILENAME = "moviedata.json";
const TABLE = "Movies";

const s3 = new AWS.S3();
const bucketParams = {
    Bucket: AWS_BUCKET,
    Key: AWS_FILENAME
};

let dbWriteStatus = {
    total: -1,
    current: -2
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

app.use(cors()); //Allow cross origin requests

//returns a promise object from the s3 bucket
function getFromS3Bucket() {
    return s3.getObject(bucketParams).promise();
}

//write the object to the db
function writeToDynamo(movieData) {
    let docClient = new AWS.DynamoDB.DocumentClient();
    dbWriteStatus.total = movieData.length;
    dbWriteStatus.current = 0;
    movieData.forEach(function (movie) {
        let params = {
            TableName: TABLE,
            Item: {
                "year": movie.year,
                "title": movie.title,
                "info": movie.info
            }
        };
        docClient.put(params, function (err, data) {
            if (err) {
                console.error("Unable to add movie", movie.title, ". Error JSON:", JSON.stringify(err, null, 2));
            } else {
                dbWriteStatus.current++;
                console.log(`PutItem succeeded: ${dbWriteStatus.current} / ${dbWriteStatus.total} - ${movie.title}`);
            }
        });
    });
}

//deletes the table in the database
function deleteDynamo() {
    return dynamoDB.deleteTable({ TableName: TABLE }).promise();
}

function resetWriteStatus() {
    dbWriteStatus.total = -1;
    dbWriteStatus.current = -2;
}

//create a database
function createDynamo() {
    return dynamoDB.createTable(dbParams).promise();
}

//reads from a local file
function getFromS3BucketLOCAL() {
    return new Promise((resolve, reject) => {
        resolve(JSON.parse(fs.readFileSync('moviedata.json', 'utf8')));
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

app.get("/movie", async (req, res) => {
    let dbRes = await queryDB(Number(req.query.year), req.query.title);
    res.send(dbRes.Items);
});

app.get("/status", (_, res) => {
    res.send({
        complete: dbWriteStatus.current === dbWriteStatus.total,
        fractionComplete: dbWriteStatus.current / dbWriteStatus.total
    });
});

app.delete("/database", (_, res) => {
    deleteDynamo().then(res => {
        resetWriteStatus();
        res.status(200).send("Database deleted");
    }).catch(err => {
        console.log(err);
        if (err)
            res.status(500).send("Failed to delete database");
    });
});

app.post("/database", (_, res) => {
    createDynamo().then(async () => {
        //let response_json = JSON.parse((await getFromS3Bucket()).Body);
        let response_json = await getFromS3BucketLOCAL();
        writeToDynamo(response_json);
        res.status(200).send("Database creation in progress");
    }).catch(() => {
        res.status(400).end();
        return;
    });

});

// (async () => {
//     await createDynamo();
//     let response_json = await getFromS3BucketLOCAL();
//     writeToDynamo(response_json);
//     setTimeout(async () => {
//         let res = await queryDB(1999, "The");
//         console.log(res.Items);
//     }, 10000);
// })();



app.listen(SERVER_PORT, () => console.log(`Server running on port: ${SERVER_PORT}`));
process.on("SIGINT", async () => {
    console.log("Wiping DB... Please wait.");
    await deleteDynamo().catch();
    console.log("DB dropped");
    process.exit(20);
});
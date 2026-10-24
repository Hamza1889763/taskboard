// Local development without Docker: starts a throwaway in-memory MongoDB
// and then the normal server pointed at it. Data is lost when you stop it.
//   npm run dev:memory
const path = require("path");
// run from app/ so the downloaded mongod is cached in app/node_modules/.cache
process.chdir(path.join(__dirname, ".."));
const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongo.getUri();
  process.env.INSTANCE_ID ||= "dev-memory";
  console.log(`[dev] in-memory MongoDB at ${process.env.MONGO_URL}`);
  require("../server");
})();

using MongoDB.Bson;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Bson.Serialization.IdGenerators;
using MongoDB.Driver;
using Returapp.Api.Models;

namespace Returapp.Api;

public class Db
{
    static Db() => ConventionRegistry.Register("returapp", new ConventionPack
    {
        new CamelCaseElementNameConvention(),
        new IgnoreExtraElementsConvention(true),
        new IgnoreIfNullConvention(true),
        // Tom string-Id ("") får en ObjectId-streng ved insert; seed-dokumenter beholder egne id-er ("omb", "u1").
        new DelegatePostProcessingConvention("stringIds", cm => { if (cm.IdMemberMap?.MemberType == typeof(string)) cm.IdMemberMap.SetIdGenerator(StringObjectIdGenerator.Instance); }),
    }, _ => true);

    public IMongoDatabase Database { get; }

    public Db(IConfiguration cfg)
    {
        var settings = MongoClientSettings.FromConnectionString(cfg["Mongo:ConnectionString"]);
        settings.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
        Database = new MongoClient(settings).GetDatabase(cfg["Mongo:Database"]);
    }

    public IMongoCollection<User> Users => Database.GetCollection<User>("users");
    public IMongoCollection<Company> Companies => Database.GetCollection<Company>("companies");
    public IMongoCollection<Pickup> Pickups => Database.GetCollection<Pickup>("pickups");
    public IMongoCollection<Category> Categories => Database.GetCollection<Category>("categories");
    public IMongoCollection<Postnr> Postnr => Database.GetCollection<Postnr>("postnr");
    public IMongoCollection<SupportCase> Support => Database.GetCollection<SupportCase>("support");
    public IMongoCollection<Otp> Otps => Database.GetCollection<Otp>("otps");
    public IMongoCollection<Invite> Invites => Database.GetCollection<Invite>("invites");
    public IMongoCollection<PasswordReset> PasswordResets => Database.GetCollection<PasswordReset>("passwordResets");
    public IMongoCollection<Notification> Notifications => Database.GetCollection<Notification>("notifications");
    public IMongoCollection<CoverageAlert> CoverageAlerts => Database.GetCollection<CoverageAlert>("coverageAlerts");
    public IMongoCollection<StoredFile> Files => Database.GetCollection<StoredFile>("files");
    public IMongoCollection<Tip> Tips => Database.GetCollection<Tip>("tips");
    IMongoCollection<BsonDocument> Raw(string name) => Database.GetCollection<BsonDocument>(name);

    public async Task Ping() => await Database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1));

    public async Task<int> NextSeq(string counter)
    {
        var doc = await Raw("counters").FindOneAndUpdateAsync(
            new BsonDocument("_id", counter),
            new BsonDocument("$inc", new BsonDocument("seq", 1)),
            new FindOneAndUpdateOptions<BsonDocument> { IsUpsert = true, ReturnDocument = ReturnDocument.After });
        return doc["seq"].ToInt32();
    }

    public async Task<string> NextPickupId() => "R-" + await NextSeq("pickup");

    public async Task EnsureIndexes()
    {
        // Demo-ordre bruker R-2028…R-2044; nye ordre starter på R-2045.
        await Raw("counters").UpdateOneAsync(new BsonDocument("_id", "pickup"),
            new BsonDocument("$setOnInsert", new BsonDocument("seq", 2044)), new UpdateOptions { IsUpsert = true });

        var stringField = (string f) => new BsonDocument(f, new BsonDocument("$type", "string"));
        var ttl = new CreateIndexOptions { ExpireAfter = TimeSpan.Zero };
        await Index("users", new BsonDocument("email", 1), new CreateIndexOptions<BsonDocument> { Unique = true, PartialFilterExpression = stringField("email") });
        await Index("users", new BsonDocument("phone", 1), new CreateIndexOptions<BsonDocument> { Unique = true, PartialFilterExpression = stringField("phone") });
        await Index("users", new BsonDocument("companyId", 1));
        await Index("companies", new BsonDocument("status", 1));
        await Index("companies", new BsonDocument("coverage", 1));
        await Index("pickups", new BsonDocument("giverUserId", 1));
        await Index("pickups", new BsonDocument("guestId", 1));
        await Index("pickups", new BsonDocument("guestPhone", 1));
        await Index("pickups", new BsonDocument { { "companyId", 1 }, { "status", 1 } });
        await Index("pickups", new BsonDocument { { "driverId", 1 }, { "status", 1 } });
        await Index("pickups", new BsonDocument { { "open", 1 }, { "status", 1 } });
        await Index("pickups", new BsonDocument("postnr", 1));
        await Index("pickups", new BsonDocument("createdAt", -1));
        await Index("categories", new BsonDocument("order", 1));
        await Index("postnr", new BsonDocument("kommune", 1));
        await Index("otps", new BsonDocument("phone", 1));
        await Index("otps", new BsonDocument("expires", 1), ttl);
        await Index("routes", new BsonDocument { { "driverId", 1 }, { "date", 1 } }, new CreateIndexOptions { Unique = true });
        await Index("notifications", new BsonDocument { { "userId", 1 }, { "createdAt", -1 } });
        await Index("support", new BsonDocument("open", 1));
        await Index("coverageAlerts", new BsonDocument("postnr", 1));
        await Index("invites", new BsonDocument("tokenHash", 1));
        await Index("invites", new BsonDocument("expires", 1), ttl);
        await Index("passwordResets", new BsonDocument("tokenHash", 1));
        await Index("passwordResets", new BsonDocument("expires", 1), ttl);
        await Index("files", new BsonDocument("pickupId", 1));
        await Index("files", new BsonDocument("orphanExpires", 1), ttl);
    }

    Task Index(string collection, BsonDocument keys, CreateIndexOptions? options = null) =>
        Raw(collection).Indexes.CreateOneAsync(new CreateIndexModel<BsonDocument>(keys, options));
}

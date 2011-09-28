var assert = require("assert");
var fs = require("fs");
var bee = require("../");

var tests = {
    expected: 27,
    executed: 0,
    finished: function() { tests.executed++; }
}
var warnings = {};
console.warn = function(msg) { warnings[msg] = true; tests.finished(); };

var router = bee.route({
    "/test": function(req, res) { assert.equal(req.url, "/test?param=1&woo=2"); tests.finished(); },
    "/throw-error": function(req, res) { throw Error("503 should catch"); },
    "r`^/name/([\\w]+)/([\\w]+)$`": function(req, res, matches) {
        assert.equal(req.url, "/name/smith/will");
        assert.equal(matches[0], "smith");
        assert.equal(matches[1], "will");
        tests.finished();
    },
    "`generics`": [ {
            test: function(req) { return req.triggerGeneric; },
            handler: function(req, res) { assert.ok(req.triggerGeneric); tests.finished(); }
        }
    ],
    "`404`": function(req, res) {
        assert.equal(req.url, "/url-not-found");
        tests.finished();
    },
    "`503`": function(req, res, err) {
        try { assert.equal(req.url, "/throw-error"); }
        catch(e) {
            console.error(e.stack);
            console.error("Caused by:");
            console.error(err.stack);
            process.exit();
        }
        assert.equal(err.message, "503 should catch");
        tests.finished();
    }
});
router({ url: "/test?param=1&woo=2" });
router({ url: "/throw-error" });
router({ url: "/name/smith/will" });
router({ url: "/random", triggerGeneric: true });
router({ url: "/url-not-found" });

router.add({ 
    "/ /home r`^/index(.php|.html|.xhtml)?$`": function(req, res) {
        assert.ok(req.url === "/" || req.url === "/index" || req.url === "/index.php" || req.url === "/home");
        tests.finished();
    }
});
router({ url: "/" });
router({ url: "/index" });
router({ url: "/index.php" });
router({ url: "/home" });

router.add({ 
    "/method-test": {
        "GET": function(req, res) { assert.equal(req.method, "GET"); tests.finished(); },
        "POST": function(req, res) { assert.equal(req.method, "POST"); tests.finished(); },
        "any": function(req, res) { assert.ok(req.method !== "GET" || req.method !== "POST"); tests.finished(); }
    }
});
router({ url: "/method-test", method: "GET" });
router({ url: "/method-test", method: "POST" });
router({ url: "/method-test", method: "HEAD" });

// Testing preprocessors
router.add({
    "`preprocess`": function(req, res) { req.foo = "bar"; res.bar = "baz"; },
    "/test-preprocess": function(req, res) {
        assert.equal(req.foo, "bar");
        assert.equal(res.bar, "baz");
        tests.finished();
    }
});
router({ url: "/test-preprocess" }, {});

// Testing warning messages
router.add({
    "/home": function() { },
    "r`^/name/([\\w]+)/([\\w]+)$`": function() { },
    "`404`": function() { },
    "`503`": function() { },
    "`not-a-valid-rule": function() { }
});

assert.ok(warnings["Duplicate beeline rule: /home"]);
assert.ok(warnings["Duplicate beeline rule: r`^/name/([\\w]+)/([\\w]+)$`"]);
assert.ok(warnings["Duplicate beeline rule: `404`"]);
assert.ok(warnings["Duplicate beeline rule: `503`"]);
assert.ok(warnings["Invalid beeline rule: `not-a-valid-rule"]);

var staticFile = bee.staticFile("../index.js", "application/x-javascript");
fs.readFile("../index.js", function(err, data) {
    if(err) { throw err; }
    
    staticFile({ url: "/test" }, { // Mock response
       writeHead: function(status, headers) {
            assert.equal(status, 200);
            assert.equal(headers["Content-Type"], "application/x-javascript");
            assert.equal(headers["Content-Length"], data.length);
            tests.finished();
        },
        end: function(body) {
            assert.deepEqual(body, data);
            fs.unwatchFile("../index.js");
            tests.finished();
        }
    });
});

var static404 = bee.staticFile("../does-not-exists", "not/real");
static404({ url: "/test" }, { // Mock response
    writeHead: function(status, headers) {
        assert.equal(status, 404);
        assert.notEqual(headers["Content-Type"], "not/real");
        tests.finished();
    },
    end: function(body) {
        assert.ok(body);
        tests.finished();
    }
});

var staticDir = bee.staticDir("../", { ".json": "application/json", "js": "application/x-javascript" });
assert.ok(warnings["Extension found without a leading periond ('.'): 'js'"]);
fs.readFile("../package.json", function(err, data) {
    if(err) { throw err; }
    
    staticDir({ url: "/test" }, { // Mock response
       writeHead: function(status, headers) {
            assert.equal(status, 200);
            assert.equal(headers["Content-Type"], "application/json");
            assert.equal(headers["Content-Length"], data.length);
            tests.finished();
        },
        end: function(body) {
            assert.deepEqual(body, data);
            fs.unwatchFile("../package.json");
            tests.finished();
        }
    }, [ "package.json" ]);
});
staticDir({ url: "/test" }, { // Mock response
    writeHead: function(status, headers) {
        assert.equal(status, 404);
        assert.ok(headers["Content-Type"]);
        tests.finished();
    },
    end: function(body) {
        assert.ok(body);
        tests.finished();
    }
}, [ "README.markdown" ]);


process.on("exit", function() {
    assert.equal(tests.executed, tests.expected);
    console.log("\n\nAll done everything passed");
});
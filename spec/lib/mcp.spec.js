"use strict";

var MCP = lib("mcp"),
    Robot = lib("robot");

describe("MCP", function() {
  it("contains a collection of robots", function() {
    expect(MCP.robots).to.have.keys('Test');
  });

  it("contains a collection of commands", function() {
    expect(MCP.commands).to.have.all.keys('create_robot', 'remove_robot', 'init_cylon');
  });

  it("contains a collection of events", function() {
    expect(MCP.events).to.be.eql(["robot_added", "robot_removed"]);
  });

  describe("#create", function() {
    afterEach(function() {
      MCP.robots = {};
    });

    it("uses passed options to create a new Robot", function() {
      var opts = { name: "Ultron" };
      var robot = MCP.create(opts);

      expect(robot.toString()).to.be.eql("[Robot name='Ultron']");
      expect(MCP.robots.Ultron).to.be.eql(robot);
    });

    it("avoids duplicating names", function() {
      MCP.create({ name: "Ultron" });
      MCP.create({ name: "Ultron" });

      var bots = Object.keys(MCP.robots);
      expect(bots).to.be.eql(["Ultron", "Ultron-1"]);
    });
  });

  describe('#remove', function () {
    beforeEach(function () {
      var opts = {name : "TestBot"};
      MCP.create(opts);
    });

    it("removes robot from MCP", function() {
      var opts = {name: "TestBot"};
      var robot = MCP.robots[opts.name];
      robot.halt = spy();
      MCP.remove(opts)
          .then(function(){
              expect(robot.halt).to.be.called;
              console.log(MCP.robots[opts.name]);
              expect(MCP.robots[opts.name]).to.be.eql(undefined);
          })
          .catch(function(){

          })

    })

  });

  describe("#start", function() {
    it("calls #start() on all robots", function() {
      var bot1 = { start: spy() },
          bot2 = { start: spy() };

      MCP.robots = {
        bot1: bot1,
        bot2: bot2
      };

      MCP.start();

      expect(bot1.start).to.be.called;
      expect(bot2.start).to.be.called;
    });
  });

  describe("#halt", function() {
    it("calls #halt() on all robots", function() {
      var bot1 = { halt: spy() },
          bot2 = { halt: spy() };

      MCP.robots = {
        bot1: bot1,
        bot2: bot2
      };

      MCP.halt();

      expect(bot1.halt).to.be.called;
      expect(bot2.halt).to.be.called;
    });
  });

  describe("#toJSON", function() {
    var json, bot1, bot2;

    beforeEach(function() {
      bot1 = new Robot();
      bot2 = new Robot();

      MCP.robots = { bot1: bot1, bot2: bot2 };
      MCP.commands.echo = function(arg) { return arg; };

      json = MCP.toJSON();
    });

    it("contains all robots the MCP knows about", function() {
      expect(json.robots).to.be.eql([bot1.toJSON(), bot2.toJSON()]);
    });

    it("contains an array of MCP commands", function() {
      expect(json.commands).to.be.eql(['create_robot', 'remove_robot', 'init_cylon', 'echo']);
    });

    it("contains an array of MCP events", function() {
      expect(json.events).to.be.eql(["robot_added", "robot_removed"]);
    });
  });
});

"use strict";

var EventEmitter = require("events").EventEmitter;

var Config = require("./config"),
    Logger = require("./logger"),
    Utils = require("./utils"),
    Robot = require("./robot"),
    _ = require("./utils/helpers");

var mcp = module.exports = new EventEmitter();

mcp.robots = {};

mcp.events = [ "robot_added", "robot_removed" ];

/**
 * Creates a new Robot with the provided options.
 *
 * @param {Object} opts robot options
 * @return {Robot} the new robot
 */
mcp.create = function create(opts) {
  opts = opts || {};

  // check if a robot with the same name exists already
  if (opts.name && mcp.robots[opts.name]) {
    var original = opts.name;
    opts.name = Utils.makeUnique(original, Object.keys(mcp.robots));

    var str = "Robot names must be unique. Renaming '";
    str += original + "' to '" + opts.name + "'";

    Logger.log(str);
  }

  var bot = new Robot(opts);
  mcp.robots[bot.name] = bot;
  mcp.emit("robot_added", bot.name);

  return bot;
};

/**
 * Removes a Robot with the provided options.
 *
 * @param {Object} opts robot options
 * @return {Robot} the new robot
 */
mcp.remove = function create(opts) {
  opts = opts || {};

  if(!opts.name){
    return "no name parameter";
  }

  if(!mcp.robots[opts.name]){
    var str = "Robot with name: " + opts.name + " does not exist.";
    return str;
  }

  // check if the robot exists
  if (mcp.robots[opts.name]) {
    var bot = mcp.robots[opts.name];

    //TODO halt robot before deleting (halt robots devices and disconnect connoections and delete devices and connections
    bot.halt(function () {

      //TODO put this in a util function
      //clear all bots timers
      // bot.timers.forEach(function (timer) {
      //   clearInterval(timer);
      // });

      delete mcp.robots[opts.name];
      mcp.emit("robot_removed", opts.name);
      return "robot " + opts.name + " removed";
    })
  }
};

mcp.commands = {
  create_robot : mcp.create,
  remove_robot : mcp.remove
};

mcp.start = function start(callback) {
  var fns = _.pluck(mcp.robots, "start");

  _.parallel(fns, function() {
    var mode = Utils.fetch(Config, "workMode", "async");
    if (mode === "sync") { _.invoke(mcp.robots, "startWork"); }
    callback();
  });
};


/**
 * Halts all MCP robots.
 *
 * @param {Function} callback function to call when done halting robots
 * @return {void}
 */
mcp.halt = function halt(callback) {
  callback = callback || function() {};

  var timeout = setTimeout(callback, Config.haltTimeout || 3000);

  _.parallel(_.pluck(mcp.robots, "halt"), function() {
    clearTimeout(timeout);
    callback();
  });
};

/**
 * Serializes MCP robots, commands, and events into a JSON-serializable Object.
 *
 * @return {Object} a serializable representation of the MCP
 */
mcp.toJSON = function() {
  return {
    robots: _.invoke(mcp.robots, "toJSON"),
    commands: Object.keys(mcp.commands),
    events: mcp.events
  };
};

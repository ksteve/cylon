"use strict";

var initializer = require("./initializer"),
    Logger = require("./logger"),
    Utils = require("./utils"),
    Config = require("./config"),
    _ = require("./utils/helpers");

var validator = require("./validator");

var EventEmitter = require("events").EventEmitter;

// used when creating default robot names
var ROBOT_ID = 1;

/**
 * Creates a new Robot instance based on provided options
 *
 * @constructor
 * @param {Object} opts object with Robot options
 * @param {String} [name] the name the robot should have
 * @param {Object} [connections] object containing connection info for the Robot
 * @param {Object} [devices] object containing device information for the Robot
 * @param {Function} [work] a function the Robot will run when started
 * @returns {Robot} new Robot instance
 */
var Robot = module.exports = function Robot(opts) {
  Utils.classCallCheck(this, Robot);

  opts = opts || {};

  validator.validate(opts);

  // auto-bind prototype methods
  for (var prop in Object.getPrototypeOf(this)) {
    if (this[prop] && prop !== "constructor") {
      this[prop] = this[prop].bind(this);
    }
  }

  this.initRobot(opts);

  _.each(opts, function(opt, name) {
    if (this[name] !== undefined) {
      return;
    }

    if (_.isFunction(opt)) {
      this[name] = opt.bind(this);

      if (opts.commands == null) {
        this.commands[name] = opt.bind(this);
      }
    } else {
      this[name] = opt;
    }
  }, this);

  if (opts.commands) {
    var cmds;

    if (_.isFunction(opts.commands)) {
      cmds = opts.commands.call(this);
    } else {
      cmds = opts.commands;
    }

    if (_.isObject(cmds)) {
      this.commands = cmds;
    } else {
      var err = "#commands must be an object ";
      err += "or a function that returns an object";
      throw new Error(err);
    }
  }

  var mode = Utils.fetch(Config, "mode", "manual");

  if (mode === "auto") {
    // run on the next tick, to allow for "work" event handlers to be set up
    setTimeout(this.start, 0);
  }
};

Utils.subclass(Robot, EventEmitter);

/**
 * Condenses information on a Robot to a JSON-serializable format
 *
 * @return {Object} serializable information on the Robot
 */
Robot.prototype.toJSON = function() {
  return {
    name: this.name,
    connections: _.invoke(this.connections, "toJSON"),
    devices: _.invoke(this.devices, "toJSON"),
    commands: Object.keys(this.commands),
    events: _.isArray(this.events) ? this.events : []
  };
};

/**
 * Adds a new Connection to the Robot with the provided name and details.
 *
 * @param {String} name string name for the Connection to use
 * @param {Object} conn options for the Connection initializer
 * @return {Object} the robot
 */
Robot.prototype.connection = function(name, conn) {
  conn.robot = this;
  conn.name = name;

  if (this.connections[conn.name]) {
    var original = conn.name,
        str;

    conn.name = Utils.makeUnique(original, Object.keys(this.connections));

    str = "Connection names must be unique.";
    str += "Renaming '" + original + "' to '" + conn.name + "'";
    this.log(str);
  }
  if ("adapter" in conn) {
    conn.adaptor = conn.adapter;
  }

  var _conn = initializer("adaptor", conn);
  this.connections[conn.name] = _conn;

  return this;
};

/**
 * Initializes all values for a new Robot.
 *
 * @param {Object} opts object passed to Robot constructor
 * @return {void}
 */
Robot.prototype.initRobot = function(opts) {
  this.name = opts.name || "Robot " + ROBOT_ID++;
  this.running = false;

  this.connections = {};

  this.devices = {};

  this.work = opts.work || opts.play;

  this.commands = {};

  if (!this.work) {
    this.work = function() { this.log("No work yet."); };
  }

  _.each(opts.connections, function(conn, key) {
    var name = _.isString(key) ? key : conn.name;

    if (conn.devices) {
      opts.devices = opts.devices || {};

      _.each(conn.devices, function(device, d) {
        device.connection = name;
        opts.devices[d] = device;
      });

      delete conn.devices;
    }

    this.connection(name, _.extend({}, conn));
  }, this);

  _.each(opts.devices, function(device, key) {
    var name = _.isString(key) ? key : device.name;
    this.device(name, _.extend({}, device));
  }, this);
};

/**
 * Adds a new Device to the Robot with the provided name and details.
 *
 * @param {String} name string name for the Device to use
 * @param {Object} device options for the Device initializer
 * @return {Object} the robot
 */
Robot.prototype.device = function(name, device) {
  var str;

  device.robot = this;
  device.name = name;

  if (this.devices[device.name]) {
    var original = device.name;
    device.name = Utils.makeUnique(original, Object.keys(this.devices));

    str = "Device names must be unique.";
    str += "Renaming '" + original + "' to '" + device.name + "'";
    this.log(str);
  }

  if (_.isString(device.connection)) {
    if (this.connections[device.connection] == null) {
      str = "No connection found with the name " + device.connection + ".\n";
      this.log(str);
      process.emit("SIGINT");
    }

    device.connection = this.connections[device.connection];
  } else {
    for (var c in this.connections) {
      device.connection = this.connections[c];
      break;
    }
  }

  this.devices[device.name] = initializer("driver", device);

  return this;
};

/**
 * Starts the Robot's connections, then devices, then work.
 *
 * @param {Function} callback function to be triggered when the Robot has
 * started working
 * @return {Object} the Robot
 */
Robot.prototype.start = function(callback) {
  if (this.running) {
    return this;
  }

  var mode = Utils.fetch(Config, "workMode", "async");

  var start = function() {
    if (mode === "async") {
      this.startWork();
    }
  }.bind(this);

  _.series([
    this.startConnections,
    this.startDevices
  ], function(err, results) {
    if (err) {
      this.log("An error occured while trying to start the robot:");
      this.log(err);

      this.halt(function() {
        if (_.isFunction(this.error)) {
          this.error.call(this, err);
        }

        if (this.listeners("error").length) {
          this.emit("error", err);
        }
      }.bind(this));
    }

    if (_.isFunction(callback)) {
      callback(err, results);
    }
  }.bind(this));

  start();
  return this;
};

/**
 * Starts the Robot's work function
 *
 * @return {void}
 */
Robot.prototype.startWork = function() {
  this.log("Working.");

  this.emit("ready", this);
  this.work.call(this, this);
  this.running = true;
};

/**
 * Starts the Robot's connections
 *
 * @param {Function} callback function to be triggered after the connections are
 * started
 * @return {void}
 */
Robot.prototype.startConnections = function(callback) {
  this.log("Starting connections.");

  var starters = _.map(this.connections, function(conn) {
    return function(cb) {
      return this.startConnection(conn, cb);
    }.bind(this);
  }, this);

  return _.parallel(starters, callback);
};

/**
 * Starts a single connection on Robot
 *
 * @param {Object} connection to start
 * @param {Function} callback function to be triggered after the connection is
 * started
 * @return {void}
 */
Robot.prototype.startConnection = function(connection, callback) {
  if (connection.connected === true) {
    return callback.call(connection);
  }

  var str = "Starting connection '" + connection.name + "'";

  if (connection.host) {
    str += " on host " + connection.host;
  } else if (connection.port) {
    str += " on port " + connection.port;
  }

  this.log(str + ".");
  this[connection.name] = connection;
  connection.connect.call(connection, callback);
  connection.connected = true;
  return true;
};

Robot.prototype.removeConnection = function(connection, callback){
  connection.disconnect(function() {
      //var conn = this[connection.name];
      delete this.connections[connection.name];
      callback();
  }.bind(this));
};

/**
 * Starts the Robot's devices
 *
 * @param {Function} callback function to be triggered after the devices are
 * started
 * @return {void}
 */
Robot.prototype.startDevices = function(callback) {
  var log = this.log;

  log("Starting devices.");

  var starters = _.map(this.devices, function(device) {
    return function(cb) {
      return this.startDevice(device, cb);
    }.bind(this);
  }, this);

  return _.parallel(starters, callback);
};

/**
 * Starts a single device on Robot
 *
 * @param {Object} device to start
 * @param {Function} callback function to be triggered after the device is
 * started
 * @return {void}
 */
Robot.prototype.startDevice = function(device, callback) {
  if (device.started === true) {
    return callback.call(device);
  }

  var log = this.log;
  var str = "Starting device '" + device.name + "'";

  if (device.pin || device.pin === 0) {
    str += " on pin " + device.pin;
  }
  log(str + ".");
  this[device.name] = device;
  device.start.call(device, callback);
  device.started = true;

  return device.started;
};

Robot.prototype.removeDevice = function (device, callback) {
  device.halt(function(){
      delete this.devices[device.name];
      return callback();
  }.bind(this));
};

Robot.prototype.createNewDevice = function(opts){
  console.log(opts);
  var self = this;

  var conn_name = opts.name;
  var conn = {name: opts.name, adaptor: opts.type, ip : opts.ip, port: opts.port };

 // this.connections[conn_name] = conn;

  var dev = {};
  dev.name = opts.name;
  dev.driver = opts.type;
  dev.connection = conn.name;

  return new Promise(function(reject, resolve) {

      //create the connection
      self.connection(conn_name, conn);

      //craete the device
      self.device(dev.name, dev);

      var connec = this.connections[conn_name];

      //start the connection
      self.startConnection(self.connections[conn_name], function () {
          //start the device
          self.startDevice(self.devices[dev.name], function () {
              console.log("Device Ready");
              resolve(self.devices[dev.name]);
          });
      });
  });
};

Robot.prototype.deleteDevice = function(opts){
  console.log(opts);
  var self = this;

  var device = self.devices[opts.name];

  if(!device){
    return "device: " + opts.name +  " not found";
  }

  var connection = device.connection;

  if(connection) {
    this.removeConnection(connection, function () {
      console.log("connection removed");
    });
  }

  this.removeDevice(device, function () {
    console.log("device removed");
  });

  return "device removed";
};

/**
 * Halts the Robot, attempting to gracefully stop devices and connections.
 *
 * @param {Function} callback to be triggered when the Robot has stopped
 * @return {void}
 */
Robot.prototype.halt = function(callback) {
  callback = callback || function() {};

  if (!this.running) {
    return callback();
  }

  // ensures callback(err) won't prevent others from halting
  function wrap(fn) {
    return function(cb) { fn.call(null, cb.bind(null, null)); };
  }

  var devices = _.pluck(this.devices, "halt").map(wrap),
      connections = _.pluck(this.connections, "disconnect").map(wrap);

  try {
    _.parallel(devices, function() {
      _.parallel(connections, callback);
    });
  } catch (e) {
    var msg = "An error occured while attempting to safely halt the robot";
    this.log(msg);
    this.log(e.message);
  }

  this.running = false;
};

/**
 * Generates a String representation of a Robot
 *
 * @return {String} representation of a Robot
 */
Robot.prototype.toString = function() {
  return "[Robot name='" + this.name + "']";
};

Robot.prototype.log = function(str) {
  Logger.log("[" + this.name + "] - " + str);
};
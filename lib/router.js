var request = require('request')
  , moment = require('moment');

var get_targets = function(drivers, moochers, end_address, callback){
  var driver_addresses = drivers.map(function(driver){
    return driver.location;
  });
  var moocher_addresses = moochers.map(function(moocher){
    return moocher.location;
  });

  if(moochers.length === 0){
    var out = [];
    for(var i = 0; i < drivers.length; i++){
      out.push({
        start: drivers[i],
        waypoints: [],
        end: end_address
      });
    }
    return callback(null, out);
  }

  var take_nearest = Math.ceil(moochers.length / drivers.length);
  take_nearest = take_nearest >= 1 ? take_nearest : 1;

  var origins = '';
  driver_addresses.forEach(function(driver){
    origins += driver.replace(/\s/g, '+') + '|';
  });
  origins = origins.substring(0, origins.length - 1);

  var ends = '';
  moocher_addresses.forEach(function(moocher){
    ends += moocher.replace(/\s/g, '+') + '|';
  });
  ends = ends.substring(0, ends.length - 1);

  var params = 'origins=' + origins + '&destinations=' + ends + '&sensor=false';

  var matrix = [];

  request('http://maps.googleapis.com/maps/api/distancematrix/json?' + params, function(err, res, body){
    if(err){
      return callback(err, null);
    }
    // console.log(params);
    var response = JSON.parse(body);
    response.rows.forEach(function(origin, index){
      // console.log(origin);
      var distances = [];
      origin.elements.forEach(function(destination, index2){
        distances.push({
          person: moochers[index2],
          name: response.destination_addresses[index2],
          distance: destination.distance.value
        });
      });
      // distances.sort(function(a, b){
      //   return a.distance > b.distance;
      // });
      matrix.push({
        driver: drivers[index],
        distances: distances
      });
      // console.log('push');
    });
    // console.log(matrix);

    // var targets = [];
    // matrix.sort(function(a, b){
    //   return a.distances[0].distance > b.distances[0].distance;
    // });

    // console.log(matrix[0].distances[0].distance, matrix[1].distances[0].distance, matrix);
    // for(var i = 0; i < matrix.length; i++){
    //   var nearest = [];
    //   // console.log(take_nearest);
    //   for(var j = 0, jj = 0; jj < take_nearest && j < matrix[i].distances.length; j++, jj++){
    //     nearest.push(matrix[i].distances.shift());
    //     // console.log(nearest, i, matrix[i].driver);
    //     j--;
    //   }
    //   for(var k = 0; k < nearest.length; k++){
    //     for(var l = i + 1; l < matrix.length; l++){
    //       var index = -1;
    //       for(var m = 0; m < matrix[l].distances.length; m++){
    //         // console.log(matrix[l][m]);
    //         if(matrix[l].distances[m].person.token == nearest[k].person.token){
    //           index = m;
    //         }
    //       }
    //       // console.log('m', index);
    //       if(index > -1){
    //         matrix[l].distances.splice(index, 1);
    //       }
    //     }
    //   }
    //   // console.log(nearest, matrix[i]);
    //   targets.push({
    //     start: matrix[i].driver,
    //     waypoints: nearest,
    //     end: end_address
    //   });
    //   // console.log(targets, i);
    // }

    // Matrix is rectangular; origin rows, dest columns
    var targets = [];
    // console.log(matrix);
    for(var origin_index = 0; origin_index < matrix.length; origin_index++){
      targets.push({
        start: matrix[origin_index].driver,
        waypoints: [],
        end: end_address
      });
    }
    // console.log(matrix[0].distances.length, matrix.length);
    for(var dest_index = 0; dest_index < matrix[0].distances.length; dest_index++){
      var min_dist = {
        index: 0,
        value: matrix[0].distances[dest_index].distance
      };
      for(var origin_index = 0; origin_index < matrix.length; origin_index++){
        // console.log(min_dist.value, matrix[origin_index].distances[dest_index].distance);
        if(min_dist.value > matrix[origin_index].distances[dest_index].distance){
          min_dist.value = matrix[origin_index].distances[dest_index].distance;
          min_dist.index = origin_index;
        }
      }
      targets[min_dist.index].waypoints.push(matrix[min_dist.index].distances[dest_index]);
    }
    // console.log('m', require('util').inspect(matrix,{depth:null}));
    // console.log('####################################');
    // console.log('t', require('util').inspect(targets,{depth:null}));

    // var formatted = [];
    // for(var i = 0; i < targets.length; i++){
    //   formatted.push({
    //     start: drivers[i],
    //     waypoints: targets[i],
    //     end: end_address
    //   });
    // }
    // callback(null, formatted);
    // console.log(require('util').inspect(targets, {depth:null}));
    callback(null, targets);
  });
};

var get_directions = function(start, waypoints, end, callback){
  var pickups = 'optimize:true';
  var waypoint_addresses = waypoints.map(function(element){
    return element.name;
  });
  waypoint_addresses.forEach(function(moocher){
    pickups += '|' + moocher.replace(/\s/g, '+');
  });

  var params = 'origin=' + start.replace(/\s/g, '+') + '&waypoints=' + pickups + '&destination=' + end.replace(/\s/g, '+') + '&sensor=false';
  // console.log(params);
  request('http://maps.googleapis.com/maps/api/directions/json?' + params, function(err, res, body){
    var directions = JSON.parse(body);
    var output = '';
    // console.log(require('util').inspect(directions, {depth:null}));
    if(directions.status !== 'ZERO_RESULTS'){
      var waypoint_counter = 0;
      var waypoint_order = directions.routes[0].waypoint_order;
      var duration = 0;
      directions.routes[0].legs.forEach(function(leg){
        output += '<ol>';
        leg.steps.forEach(function(step){
          output += '<li>' + step.html_instructions + '</li>';
        });
        output += '</ol>';
        if(waypoint_counter < waypoints.length){
          output += '<p>Pick up <b>' + waypoints[waypoint_order[waypoint_counter]].person.name +'</b></p>';
        }
        waypoint_counter++;
        duration += leg.duration.value;
      });
      duration = moment.duration(1000 * duration).humanize();
      output += '<p>Arrive at ' + end + '.</p>';
      output = '<p>Expect <b>' + duration + '</b> of travel time.' + output;
      callback(null, output);
    }
    else{
      callback(null, '<p>Driving directions cannot be computed with these endpoints.</p>');
    }
  });
};

module.exports = {
  get_groups: function(drivers, moochers, end, callback){
    get_targets(drivers, moochers, end, function(err, targets){
      if(err){
        return callback(err, null);
      }
      // var out = [];
      // for(var i = 0; i < targets.length; i++){
      //   out.push({
      //     name: drivers[i].name,
      //     targets: targets[i]
      //   });
      // }
      // console.log(require('util').inspect(out, {depth:null}));
      // callback(null, out);
      callback(null, targets);
    });
  },
  get_directions: function(group, callback){
    // console.log(group);
    get_directions(group.start.location, group.waypoints, group.end, function(err, directions){
      if(err){
        return callback(err, null);
      }
      var out = {
        name: group.start.name,
        directions: directions
      };
      callback(null, out);
    });
  }
};
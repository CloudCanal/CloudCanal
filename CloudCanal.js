var ccUrl =
  'https://rrr6b3hn94.execute-api.us-east-2.amazonaws.com/prod/request';
var queryParams;

var ccBanner =
  '<div id="cc-banner" style="justify-content:center; z-index:9999999999999999999999999 !important; position:fixed; bottom:0; background-color:#1a1b1f; display:-webkit-box; display:-webkit-flex; display:-ms-flexbox; display:flex; width:100%; padding-right:15px; padding-left:15px; padding-bottom:0; padding-top:0; -webkit-box-align:center; -webkit-align-items:center; -ms-flex-align:center; align-items:center margin:0;"><img src="https://uploads-ssl.webflow.com/5d646314371eb719a0f66681/5d7a7566a637b30faab85956_cloud%20canal%20webclip.png" alt="" style="margin-right:15px; height:80px; padding:0; margin-left:0; margin-top:0; margin-bottom:0;"><p style="margin:0; padding-top:15px; padding-bottom:15px; padding-left:0; padding-right:0; color:#fff; font-size:14px; line-height:16px">Thank you for trying Cloud Canal! When you\'re finished designing your site, head over to <a href="https://www.cloudcanal.io/domains" style="color:#fff; display:inline-block;">cloudcanal.io/domains</a> to upgrade it with a professional plan.</p></div>';

$(function() {
  $.cachedScript(
    'https://cdnjs.cloudflare.com/ajax/libs/jquery.serializeJSON/2.9.0/jquery.serializejson.min.js'
  ).done(function(script, textStatus) {
    initializePage();
  });
});

// called on page load
function initializePage() {
  // set up element selector for attributes that start with a given string (ex. "data-cc-http-")
  initializeAttrStartsWithSelector();
  // parse query string to an object
  queryParams = parseQueryString();
  // find all cc forms on page and set up to link with corresponding endpoints
  setupForms();
  // fire any data-cc-on-load events
  triggerLoadEvents();
  // setup on-click events
  setupClickEvents();
  // setup on-change events
  setupChangeEvents();
  // initialize stripe.js script
  initializeStripe();
}

// if the page contains any cc-stripe attributes, load stripe.js and initialize any stripe elements
function initializeStripe() {
  if ($('[data-cc-stripe]').length > 0) {
    $.cachedScript('https://js.stripe.com/v3/').done(function() {
      var form = $('form[data-cc-stripe]').filter(function() {
        return $(this)
          .data('cc-stripe')
          .startsWith('form:');
      });
      form.each(function() {
        var publicKey = $(this)
          .data('cc-stripe')
          .substring(5);
        $(this).data('stripe', Stripe(publicKey));
        parseStripeCardField($(this));
      });
    });
  }
}

function parseQueryString(queryString = location.search) {
  var qp = {};
  queryString
    .substr(1)
    .split('&')
    .forEach(function(pair) {
      if (pair === '') return;
      var parts = pair.split('=');
      qp[parts[0]] =
        parts[1] && decodeURIComponent(parts[1].replace(/\+/g, ' '));
    });
  return qp;
}

// adds the stripe card token to the form
function stripeTokenHandler(form, token) {
  var hiddenInput = document.createElement('input');
  hiddenInput.setAttribute('type', 'hidden');
  hiddenInput.setAttribute('name', 'stripeToken');
  hiddenInput.setAttribute('value', token.id);
  form.appendChild(hiddenInput);
}

// parses the stripe form, returning an object with all the present inputs according to TokenData
function parseStripeCardField(form) {
  var stripe = form.data('stripe');
  var elements = stripe.elements();

  var cardPlaceholder = form.find('div[data-cc-stripe]').filter(function() {
    return $(this)
      .data('cc-stripe')
      .startsWith('card');
  });
  if (cardPlaceholder) {
    var style = {};
    // the cc-stripe card tag can inclue optional styling info, ex. data-cc-stripe='card:{"base":{"fontSize":"16px", "color":"#1a1b1f", "fontFamily":"Gordita"}}'
    if (cardPlaceholder.data('cc-stripe').includes(':')) {
      style = JSON.parse(cardPlaceholder.data('cc-stripe').substring(5));
    }

    var card = elements.create('card', { style });
    card.mount(cardPlaceholder.get(0));
    card.addEventListener('change', ({ error }) => {
      var displayError = form.find('[data-cc-stripe="errors"]').get(0);
      if (error && displayError) {
        displayError.textContent = error.message;
      } else {
        displayError.textContent = '';
      }
    });
    form.data('stripeCard', card);
  }
}

// traverses the stripe elements in the form and compiles a list of customer data
function parseStripeTokenData(form) {
  var tokenData = {};
  var elements = form.find('[data-cc-stripe]');
  elements.each(function() {
    var element = $(this);
    var type = element.data('cc-stripe');
    if (
      type === 'name' ||
      type === 'address_line1' ||
      type === 'address_line2' ||
      type === 'address_city' ||
      type === 'address_state' ||
      type === 'address_zip' ||
      type === 'address_country' ||
      type === 'currency'
    ) {
      tokenData[type] = element.val();
    }
  });
  return tokenData;
}

function setupForms() {
  // get all Cloud Canal forms on page
  var ccForms = $('form[data-cc-endpoint]');
  ccForms.find('input[type=submit]').click(function() {
    $('input[type=submit]', $(this).parents('form')).removeAttr('clicked');
    $(this).attr('clicked', 'true');
  });
  // new form handling
  ccForms.each(function() {
    $(this).submit(function(event) {
      event.preventDefault();
      // if form has a 'data-cc-stripe' attribute, attempt to get a card token
      var form = $(this);
      var formTag = form.data('cc-stripe');
      if (formTag && formTag.startsWith('form:')) {
        var stripe = form.data('stripe');
        var card = form.data('stripeCard');
        var tokenData = parseStripeTokenData(form);
        stripe.createToken(card, tokenData).then(function({ token, error }) {
          if (error) {
            var errorElement = form.find('[data-cc-stripe="errors"]').get(0);
            if (errorElement) errorElement.textContent = error.message;
          } else {
            stripeTokenHandler(form.get(0), token);
            prepareForm(form);
          }
        });
        // disable default form behavior
        return false;
      }
      // else this is a normal Cloud Canal form
      else {
        prepareForm(form);
        // disable default form behavior
        return false;
      }
    });
  });
}

function prepareForm(form) {
  // get endpoint object from attribute on form
  var endpoint = parseEndpoint(form.data('cc-endpoint'));
  // serialize the body based on "name" tag to be sent as JSON
  var body = form.serializeJSON();
  //check to see if the clicked button includes a name and value attribute, and include in body if so
  var submitButton = form.find('input[type=submit][clicked=true]');
  var submitButtonName, submitButtonValue;
  if (submitButton) {
    submitButtonName = submitButton.prop('name');
    submitButtonValue = submitButton.prop('value');
    if (submitButtonName && submitButtonValue)
      body[submitButtonName] = submitButtonValue;
  }
  // disable all inputs that aren't already disabled
  var disabled = form.find(':input').filter(function() {
    return $(this).prop('disabled') === false;
  });
  disabled.data('cc-submit-disabled', true);
  disabled.prop('disabled', true);
  // send HTTP request
  httpRequest(form, 'POST', ccUrl, endpoint, body, function(caller) {
    // enable all inputs
    var disabled = caller.find(':input').filter(function() {
      return $(this).data('cc-submit-disabled') === true;
    });
    disabled.data('cc-submit-disabled', false);
    disabled.prop('disabled', false);
  });
}

// find data-cc-on-click elements and attach event handlers
function setupClickEvents() {
  var elements = $('[data-cc-on-click]');
  elements.click(function() {
    var action = $(this).data('cc-on-click');
    triggerAction(action, $(this));
  });
}

// find data-cc-on-change elements and attach event handlers
function setupChangeEvents() {
  var elements = $('[data-cc-on-change]');
  elements.change(function() {
    var action = $(this).data('cc-on-change');
    triggerAction(action, $(this));
  });
}

// find data-cc-on-load elements and trigger the endpoints
function triggerLoadEvents() {
  var elements = $('[data-cc-on-load]');
  elements.each(function() {
    var action = $(this).data('cc-on-load');
    triggerAction(action, $(this));
  });
}

function httpRequest(
  caller,
  method,
  url,
  endpoint,
  body = null,
  callback = null
) {
  // get a list of all elements that will be triggered by this endpoint object
  var targetedElements = getTargetedElements(endpoint);
  // show loader element (ex. spinner) if applicable
  showLoader(targetedElements);
  // trigger any http-start tags
  triggerHttpStartEvents(targetedElements);
  // start a new HTTP request with JSON payload and endpoint denoted in header
  var request = new XMLHttpRequest();
  request.overrideMimeType('application/json');
  request.open(method, url, true);
  request.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
  request.setRequestHeader('X-CC-Endpoint', endpoint['id']);
  // stringify any cookies linked to the page and send them in a header
  request.setRequestHeader('X-CC-Cookies', document.cookie);
  // send query string
  request.setRequestHeader('X-CC-QueryString', location.search);

  // when the request is complete:
  request.onload = function() {
    // extract response to variable
    var response = JSON.parse(request.responseText);
    // hide the loader if applicable
    hideLoader(targetedElements);
    // update or create any cookies based on the defined ones in the endpoint
    updateCookies(request.getResponseHeader('X-CC-Cookies'), response);
    // fire off any http events (denoted by attributes starting with "data-cc-http-"); get targeted elements again, in case any were added via array
    triggerHttpEvents(targetedElements, request.status, response);
    // do the same for any array elements (templates, 'data-cc-array')
    loadArrays(targetedElements, request.status, response);
    // show the banner if this is an Evaluation subscription
    if (
      request.getResponseHeader('X-CC-Subscription') === 'Evaluation' &&
      $('#cc-banner').length === 0
    ) {
      $('body').append(ccBanner);
    }

    if (callback) callback(caller);
  };
  if (body !== null) {
    request.send(JSON.stringify(body));
  } else {
    request.send();
  }
}

// trigger events designated as start events (fired as soon as call is made)
function triggerHttpStartEvents(elements) {
  elements.filter('[data-cc-http-start]').each(function() {
    var element = $(this);
    // get the set action; status-specific actions take precedence
    var action = element.data('cc-http-start');
    triggerAction(action, element);
  });
}

// perform an action (such as hide/show) when a certain status code is received
function triggerHttpEvents(elements, status, response) {
  // must get targeted elements again to account for any changes to DOM
  elements
    .filter(function() {
      return (
        $(this).data('cc-http-default') || $(this).data('cc-http-' + status)
      );
    })
    .each(function() {
      var element = $(this);
      // get the set action; status-specific actions take precedence
      var action =
        element.data('cc-http-' + status) || element.data('cc-http-default');
      triggerAction(action, element, response);
    });
}

// carries out the action (usually passed by an event)
function triggerAction(value, element, response) {
  //split the value into individual actions
  var actions = value.split(';;');
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i].trim();
    // parse any variables only if the action is not an options list for a select element (this is handled differently in the if statement below)
    if (!action.startsWith('options:')) {
      // parse any params
      var parsedData = parseData(element, action, response);
      // if all params found, execute the action, else continue
      if (parsedData[1]) continue;
      action = parsedData[0];
    }

    // show element action: "show"
    if (action === 'show') {
      element.show();
    }

    // hide element action: "hide"
    else if (action === 'hide') {
      element.hide();
    }

    // insert the value into the element
    else if (action.startsWith('value:')) {
      action = action.substring(6);
      insertResponse(element, action);
    }

    // insert the value as an href attribute
    else if (action.startsWith('href:')) {
      action = action.substring(5);
      element.attr('href', action);
    }

    // call endpoint action: "endpoint:[endpoint]"
    else if (action.startsWith('endpoint:')) {
      var endpoint = parseEndpoint(action.substring(9));
      var triggeredForms = getTargetedElements(endpoint).filter('form');
      // if forms exist to be sent, then submit them; else submit a request without body
      if (triggeredForms.length > 0) {
        triggeredForms.submit();
      } else {
        httpRequest($(this), 'POST', ccUrl, endpoint);
      }
    }

    // redirect to url action: "redirect:[url]"
    else if (action.startsWith('redirect:')) {
      var url = action.substring(9);
      window.location.replace(url);
    }

    // remove array item action: "array-remove:[endpoint] | [true]"
    else if (action.startsWith('array-remove:')) {
      action = action.substring(13);
      //if set to 'true', remove the closest parent array element
      if (action === 'true') {
        element
          .parents('[data-cc-array]')
          .first()
          .remove();
      }
      // else remove the last element within the endpoint array (useful for a 'subtract' button)
      else {
        var endpoint = parseEndpoint(action);
        var container = $(
          `[data-cc-array-container="${endpoint['instance']}_${endpoint['id']}"]`
        );
        container
          .children()
          .last()
          .remove();
      }
    }

    // add array item action: "array-add:[endpoint]"
    else if (action.startsWith('array-add:')) {
      action = action.substring(10);
      var endpoint = parseEndpoint(action);
      // get the template for the given array (saved when array is loaded in loadArrays())
      var template = window[
        `array_template_${endpoint['instance']}_${endpoint['id']}`
      ].clone(true);
      var container = $(
        `[data-cc-array-container="${endpoint['instance']}_${endpoint['id']}"]`
      );
      // append the template to the array
      container.append(template);
    }

    // setting a cookie action: "cookie-set:[key]=[value]"
    else if (action.startsWith('cookie-set:')) {
      action = action.substring(11);
      action = action.split('=');
      setCookie(action[0], action[1]);
    }

    // clearing a cookie action: "cookie-clear:[key]"
    else if (action.startsWith('cookie-clear:')) {
      action = action.substring(13);
      deleteCookie(action);
    }

    // options for a select element
    else if (action.startsWith('options:')) {
      var values = action.substring(8).split(':');
      var array = parseObject(values[0], response);
      if (array[1]) return;
      // generate and insert the options into the select element
      for (var i = 0; i < array[0].length; i++) {
        var item = array[0][i];
        var parsedText = parseData(element, values[1], item);
        if (parsedText[1]) return;
        var parsedValue = parseData(element, values[2], item);
        if (parsedValue[1]) return;
        element.append(
          $('<option>', {
            value: parsedValue[0],
            text: parsedText[0]
          })
        );
      }
    }
  }
}

function loadArrays(targetedElements, status, response) {
  targetedElements.filter('[data-cc-array]').each(function() {
    var arrayEndpoint = parseEndpoint($(this).data('cc-endpoint'));
    // parse the array attribute (which denotes a path to where the root of the array is)
    var parsedArray = parseObject($(this).data('cc-array'), response);
    if (parsedArray[1] || !Array.isArray(parsedArray[0])) return;

    // note the parent element and flag it with a data-cc-array-container="[endpoint]" attribute
    var parentElement = $(this).parent();
    parentElement.attr(
      'data-cc-array-container',
      `${arrayEndpoint['instance']}_${arrayEndpoint['id']}`
    );
    // create a clone of the template, noting its parent for placing future copies, and devare the contents of the parent element
    // this strange notation is so that we can save the array template to a global variable, for use later when adding elements to an array via an action
    window[
      `array_template_${arrayEndpoint['instance']}_${arrayEndpoint['id']}`
    ] = $(this).clone(true);
    parentElement.html('');

    // make copies of the template in the DOM
    for (var i = 0; i < parsedArray[0].length; i++) {
      parentElement.append(
        window[
          `array_template_${arrayEndpoint['instance']}_${arrayEndpoint['id']}`
        ].clone(true)
      );
    }

    // start at first instance of clone
    var template = parentElement.children(
      ':nth-last-child(' + parsedArray[0].length + ')'
    );

    for (var i = 0; i < parsedArray[0].length; i++) {
      var data = parsedArray[0][i];
      // find all elements within the template that have array element attributes and trigger them
      template.find('[data-cc-array-element]').each(function() {
        var element = $(this);
        var action = element.data('cc-array-element');
        triggerAction(action, element, data);
      });
      // set the template to the next copied instance, to be filled in again
      template = template.next();
    }
  });
}

// insert the response into the element
function insertResponse(element, value) {
  var elementType = element.prop('nodeName').toLowerCase();
  switch (elementType) {
    case 'img':
      element.attr('src', value);
      break;

    case 'input':
      var type = element.prop('type').toLowerCase();
      if (type === 'checkbox') {
        if (value == 'true') element.prop('checked', true).change();
        else element.prop('checked', false).change();
      } else element.val(value);
      break;

    case 'select':
      element.val(value);
      break;

    case 'textarea':
      element.val(value);
      break;

    default:
      element.text(value);
      break;
  }
}

// parse the stringified endpoint, separating out an instance number if present and removing the label from the endpoint id if present
function parseEndpoint(endpoint) {
  var instance,
    id = endpoint;
  var result = {};
  if (endpoint.includes(':')) {
    instance = endpoint.split(':')[0];
    result['instance'] = instance;
    id = endpoint.split(':')[1];
  }
  id = id.substring(id.lastIndexOf('_') + 1);
  result['id'] = id;
  return result;
}

// this function compares the caller and callee endpoint objects (which include 'id' and 'instance') and returns a boolean value to determine whether the callee should be called by the caller
function endpointIsCalled(caller, callee) {
  if (caller['instance']) {
    if (
      caller['instance'] === callee['instance'] &&
      caller['id'] === callee['id']
    )
      return true;
  } else {
    if (caller['id'] === callee['id']) return true;
  }
  return false;
}

// gets all elements with the cc-endpoint tag targeted by the corresponding endpoint object
function getTargetedElements(endpoint) {
  return $('[data-cc-endpoint]').filter(function() {
    var ep = parseEndpoint($(this).data('cc-endpoint'));
    return endpointIsCalled(endpoint, ep);
  });
}

// shows any elements that are designated as loaders for the corresponding endpoint (on call start)
function showLoader(elements) {
  elements.filter('[data-cc-loader]').show();
}

// hides any elements that are designated as loaders for the corresponding endpoint (on call return)
function hideLoader(elements) {
  elements.filter('[data-cc-loader]').hide();
}

// set a cookie for the end user
function setCookie(cname, cvalue, exmilli = null) {
  if (exmilli !== null) {
    var d = new Date();
    d.setTime(d.getTime() + exmilli);
    var expires = 'expires=' + d.toUTCString();
    document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/';
  } else {
    document.cookie = cname + '=' + cvalue + ';path=/';
  }
}

// get a cookie on the user's computer which has previously been set
function getCookie(cname, cookies = document.cookie) {
  var name = cname + '=';
  var ca = cookies.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i].trim();
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
}

// accepts a JSON stringified list of cookie name/location pairs, checks to see if the locations exist in the response, and if so, updates or creates the cookie. Clears any marked cookies.
function updateCookies(cookieString, response) {
  // parse the string to JSON object of cookies
  var cookies = JSON.parse(cookieString);
  if (cookies === null) return;
  // for each in object, check to see if the response exists and if so, create/update cookie
  for (var i = 0; i < cookies.length; i++) {
    var cookie = cookies[i];
    // if cookie action is 'Set', then parse and set the cookie
    if (cookie['Action'] === 'Set') {
      if (!cookie['Key'] || !cookie['Value']) continue;
      var parsed_data = parseData(null, cookie['Value'], response);
      var param_not_found = parsed_data[1];
      if (!param_not_found) {
        setCookie(cookie['Key'], parsed_data[0]);
      }
    }
    // else the cookie is 'Clear', and should delete the cookie
    else {
      deleteCookie(cookie['Key']);
    }
  }
}

// delete the cookie with the given name
function deleteCookie(cname) {
  document.cookie = `${cname}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// parse the target string (typically a data attribute string with params), replacing all variables with corresponding values. If any params not found in response, flag is set to TRUE
// DO NOT REMOVE THE 'element' PARAMETER; FOR USE IN CUSTOM FUNCTIONS
function parseData(
  element,
  target,
  response,
  cookies = document.cookie,
  queries = queryParams
) {
  var val;
  var param_not_found = false;
  var params = target.match(/\{\{.*?\}\}/g);
  if (params !== null) {
    for (var i = 0; i < params.length; i++) {
      var param = params[i].substring(2, params[i].length - 2);
      // check if parameter calls for a cookie, and if so, get value
      if (param.toLowerCase().startsWith('cookie:')) {
        param = param.substring(7);
        val = getCookie(param, cookies);
      }
      // check if param calls for a query string parameter
      else if (param.toLowerCase().startsWith('query:')) {
        param = param.substring(6);
        val = queries[param];
      }
      // check if param is a custom function
      else if (param.toLowerCase().startsWith('fcn:')) {
        // the "element" function parameter above exists explicitly to be referenced here, in case the custom function ever has to reference the element to which it is applied
        param = param.substring(4);
        try {
          val = eval(param);
        } catch (error) {
          console.log('Error parsing custom function: ' + error);
        }
      }
      // else the parameter is searched for in the body
      else {
        val = findValue(param, response);
      }
      // if a param is not found, set the flag and end search
      if (val === undefined) {
        param_not_found = true;
      }
      target = target.replace(new RegExp(RegExp.escape(params[i]), 'g'), val);
    }
  }
  return [target, param_not_found];
}

// same as parseData() but returns an object instead of string. Useful for finding the root of an array
function parseObject(target, response) {
  var val;
  var param_not_found = false;
  var params = target.match(/\{\{.*?\}\}/g);
  if (params !== null) {
    for (var i = 0; i < params.length; i++) {
      var param = params[i].substring(2, params[i].length - 2);
      // the parameter is searched for in the body
      val = findValue(param, response);
      if (val === undefined) {
        param_not_found = true;
      }
    }
  } else {
    param_not_found = true;
  }
  return [val, param_not_found];
}

// searches for and returns the value given a path and a response to look through
function findValue(path, response) {
  var parsedPath = path.split('.');
  // if the response path is an asterisk, return the root response (so don't extract the value from the path because there is no path to parse)
  if (parsedPath[0] != '*' && response !== undefined) {
    // extract the value from the response at that path
    for (var i = 0; i < parsedPath.length; i++) {
      response = response[parsedPath[i]];
      if (response === undefined) break;
    }
  }
  return response;
}

// creates a JQuery element selector for attributes that start with the passed string
function initializeAttrStartsWithSelector() {
  jQuery.extend(jQuery.expr[':'], {
    attrStartsWith: function(el, _, b) {
      for (var i = 0, atts = el.attributes, n = atts.length; i < n; i++) {
        if (atts[i].nodeName.toLowerCase().indexOf(b[3].toLowerCase()) === 0) {
          return true;
        }
      }
      return false;
    }
  });
}

// load an external library for parsing forms to JSON
jQuery.cachedScript = function(url, options) {
  // Allow user to set any option except for dataType, cache, and url
  options = $.extend(options || {}, {
    dataType: 'script',
    cache: true,
    url: url
  });
  // Use $.ajax() since it is more flexible than $.getScript
  // Return the jqXHR object so we can chain callbacks
  return jQuery.ajax(options);
};

// this function escapes any special characters in a string
RegExp.escape = function(s) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};

/*
Misc:
  data-cc-endpoint: {endpoint_id}
  data-cc-loader: true
  data-cc-stripe: form:{stripe_public_key} | card{:optional_styling} | errors | {tokenData input}

Arrays:
  data-cc-array: {path.to.array}
  data-cc-array-element: {action(s)} - any references are taken from the array root, not the response root

Events:
  User Events:
    data-cc-on-load: {action(s)}
    data-cc-on-click: {action(s)}
    data-cc-on-change: {action(s)}

  HTTP Events:
    data-cc-http-start: {actions(s)}
    data-cc-http-{status}: {actions(s)}
    data-cc-http-default: {actions(s)}

      Actions:
        show
        hide
        value: {value}
        href: {url}
        endpoint: {endpoint_id}
        redirect: {url}
        array-add: {endpoint_id}
        array-remove: {endpoint_id} | true
        cookie-set: {key}={value}
        cookie-clear: {key}
        options:{path.to.array}:{text}:{value}

      Parameters:
        cookie: {key}
        query: {key}
        fcn: {code}
        {path_or_value}
*/

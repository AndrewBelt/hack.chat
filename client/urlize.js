var urlize = (function () {

  // From http://blog.stevenlevithan.com/archives/cross-browser-split
  // modified to not add itself to String.prototype.

  /*!
   * Cross-Browser Split 1.1.1
   * Copyright 2007-2012 Steven Levithan <stevenlevithan.com>
   * Available under the MIT License
   * ECMAScript compliant, uniform cross-browser split method
   */

  /**
   * Splits a string into an array of strings using a regex or string separator. Matches of the
   * separator are not included in the result array. However, if `separator` is a regex that contains
   * capturing groups, backreferences are spliced into the result each time `separator` is matched.
   * Fixes browser bugs compared to the native `String.prototype.split` and can be used reliably
   * cross-browser.
   * @param {String} str String to split.
   * @param {RegExp|String} separator Regex or string to use for separating the string.
   * @param {Number} [limit] Maximum number of items to include in the result array.
   * @returns {Array} Array of substrings.
   * @example
   *
   * // Basic use
   * split('a b c d', ' ');
   * // -> ['a', 'b', 'c', 'd']
   *
   * // With limit
   * split('a b c d', ' ', 2);
   * // -> ['a', 'b']
   *
   * // Backreferences in result array
   * split('..word1 word2..', /([a-z]+)(\d+)/i);
   * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
   */
  var split;

  // Avoid running twice; that would break the `nativeSplit` reference
  split = split || function (undef) {

    var nativeSplit = String.prototype.split,
      compliantExecNpcg = /()??/.exec("")[1] === undef, // NPCG: nonparticipating capturing group
      self;

    self = function (str, separator, limit) {
      // If `separator` is not a regex, use `nativeSplit`
      if (Object.prototype.toString.call(separator) !== "[object RegExp]") {
        return nativeSplit.call(str, separator, limit);
      }

      var output = [],
        flags = (separator.ignoreCase ? "i" : "") + (separator.multiline ? "m" : "") + (separator.extended ? "x" : "") + // Proposed for ES6
        (separator.sticky ? "y" : ""), // Firefox 3+
        lastLastIndex = 0, // Make `global` and avoid `lastIndex` issues by working with a copy
        separator = new RegExp(separator.source, flags + "g"),
        separator2, match, lastIndex, lastLength;

      str += ""; // Type-convert

      if (!compliantExecNpcg) {
        // Doesn't need flags gy, but they don't hurt
        separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
      }

      /* Values for `limit`, per the spec:
       * If undefined: 4294967295 // Math.pow(2, 32) - 1
       * If 0, Infinity, or NaN: 0
       * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
       * If negative number: 4294967296 - Math.floor(Math.abs(limit))
       * If other: Type-convert, then use the above rules
       */
      limit = limit === undef ?
        -1 >>> 0 : // Math.pow(2, 32) - 1
        limit >>> 0; // ToUint32(limit)

      while (match = separator.exec(str)) {
        // `separator.lastIndex` is not reliable cross-browser
        lastIndex = match.index + match[0].length;
        if (lastIndex > lastLastIndex) {
          output.push(str.slice(lastLastIndex, match.index));
          // Fix browsers whose `exec` methods don't consistently return `undefined` for
          // nonparticipating capturing groups
          if (!compliantExecNpcg && match.length > 1) {
            match[0].replace(separator2, function () {
              for (var i = 1; i < arguments.length - 2; i++) {
                if (arguments[i] === undef) {
                  match[i] = undef;
                }
              }
            });
          }
          if (match.length > 1 && match.index < str.length) {
            Array.prototype.push.apply(output, match.slice(1));
          }
          lastLength = match[0].length;
          lastLastIndex = lastIndex;
          if (output.length >= limit) {
            break;
          }
        }
        if (separator.lastIndex === match.index) {
          separator.lastIndex++; // Avoid an infinite loop
        }
      }
      if (lastLastIndex === str.length) {
        if (lastLength || !separator.test("")) {
          output.push("");
        }
      } else {
        output.push(str.slice(lastLastIndex));
      }
      return output.length > limit ? output.slice(0, limit) : output;
    };

    return self;
  }();


  function startswith(string, prefix) {
    return string.substr(0, prefix.length) == prefix;
  }

  function endswith(string, suffix) {
    return string.substr(string.length - suffix.length, suffix.length) == suffix;
  }

  // http://stackoverflow.com/a/7924240/17498
  function occurrences(string, substring) {
    var n = 0;
    var pos = 0;
    while (true) {
      pos = string.indexOf(substring, pos);
      if (pos != -1) {
        n++;
        pos += substring.length;
      } else {
        break;
      }
    }
    return n;
  }

  var unquoted_percents_re = /%(?![0-9A-Fa-f]{2})/;

  // Quotes a URL if it isn't already quoted.
  function smart_urlquote(url) {
    // XXX: Not handling IDN.
    // 
    // Convert protocol to lowercase.
    var colonIndex = url.indexOf(':');
    url = url.substring(0, colonIndex).toLowerCase() + url.substring(colonIndex);
    // 
    // An URL is considered unquoted if it contains no % characters or
    // contains a % not followed by two hexadecimal digits.
    if (url.indexOf('%') == -1 || url.match(unquoted_percents_re)) {
      return encodeURI(url);
    } else {
      return url;
    }
  }

  var trailing_punctuation_django = ['.', ',', ':', ';'];
  var trailing_punctuation_improved = ['.', ',', ':', ';', '.)'];
  var wrapping_punctuation_django = [['(', ')'], ['<', '>'], ['&lt;', '&gt;']];
  var wrapping_punctuation_improved = [['(', ')'], ['<', '>'], ['&lt;', '&gt;'], 
  				     ['“', '”'], ['‘', '’']];
  var word_split_re_django = /(\s+)/;
  var word_split_re_improved = /([\s<>"]+)/;
  var simple_url_re = /^https?:\/\/\w/i;

  var django_top_level_domains = ['com', 'edu', 'gov', 'int', 'mil', 'net', 'org'];
  var simple_email_re = /^\S+@\S+\.\S+$/;

  function htmlescape(html, options) {
    var escaped = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    if (options && !options.django_compatible) { // only on django_compatible because => https://github.com/ljosa/urlize.js/pull/9
      escaped = escaped.replace(/\//g, "&#47;");
    }
    return escaped;
  }

  function urlescape(url) {
    return url // Do not escape slash, because is used for the http:// part
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function convert_arguments(args) {
    var options;
    if (args.length == 2 && typeof (args[1]) == 'object') {
      options = args[1];
    } else {
      options = {
        nofollow: args[1],
        autoescape: args[2],
        trim_url_limit: args[3],
        target: args[4]
      };
    }
    if (!('django_compatible' in options)) options.django_compatible = true;
    return options;
  }

  function urlize(text, options) {
    options = convert_arguments(arguments);

    function trim_url(x, limit) {
      if (options.trim === "http" || options.trim === "www")
        x = x.replace(/^https?:\/\//i, '');
      if (options.trim === "www")
        x = x.replace(/^www\./i, '');
      if (limit === undefined) limit = options.trim_url_limit;
      if (limit && x.length > limit) return x.substr(0, limit - 3) + '...';
      return x;
    }
    var safe_input = false;
    var word_split_re = options.django_compatible ? word_split_re_django : word_split_re_improved;
    var trailing_punctuation = options.django_compatible ? trailing_punctuation_django : trailing_punctuation_improved;
    var wrapping_punctuation = options.django_compatible ? wrapping_punctuation_django : wrapping_punctuation_improved;
    var simple_url_2_re = new RegExp('^www\\.|^(?!http)\\w[^@]+\\.(' + 
                        (options.top_level_domains || django_top_level_domains).join('|') + 
                        ')$', 
                        "i");
    var words = split(text, word_split_re);
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var match = undefined;
      if (word.indexOf('.') != -1 || word.indexOf('@') != -1 || word.indexOf(':') != -1) {
        // Deal with punctuation.
        var lead = '';
        var middle = word;
        var trail = '';
        for (var j = 0; j < trailing_punctuation.length; j++) {
          var punctuation = trailing_punctuation[j];
          if (endswith(middle, punctuation)) {
            middle = middle.substr(0, middle.length - punctuation.length);
            trail = punctuation + trail;
          }
        }
        for (var j = 0; j < wrapping_punctuation.length; j++) {
          var opening = wrapping_punctuation[j][0];
          var closing = wrapping_punctuation[j][1];
          if (startswith(middle, opening)) {
            middle = middle.substr(opening.length);
            lead = lead + opening;
          }
          // Keep parentheses at the end only if they're balanced.
          if (endswith(middle, closing) && occurrences(middle, closing) == occurrences(middle, opening) + 1) {
            middle = middle.substr(0, middle.length - closing.length);
            trail = closing + trail;
          }
        }

        // Make URL we want to point to.
        var url = undefined;
        var nofollow_attr = options.nofollow ? ' rel="nofollow"' : '';
        var target_attr = options.target ? ' target="' + options.target + '"' : '';

        if (middle.match(simple_url_re)) url = smart_urlquote(middle);
        else if (middle.match(simple_url_2_re)) url = smart_urlquote('http://' + middle);
        else if (middle.indexOf(':') == -1 && middle.match(simple_email_re)) {
          // XXX: Not handling IDN.
          url = 'mailto:' + middle;
          nofollow_attr = '';
        }

        // Make link.
        if (url) {
          var trimmed = trim_url(middle);
          if (options.autoescape) {
            // XXX: Assuming autoscape == false
            lead = htmlescape(lead, options);
            trail = htmlescape(trail, options);
            url = urlescape(url);
            trimmed = htmlescape(trimmed, options);
          }
          middle = '<a href="' + url + '"' + nofollow_attr + target_attr + '>' + trimmed + '</a>';
          words[i] = lead + middle + trail;
        } else {
          if (safe_input) {
            // Do nothing, as we have no mark_safe.
          } else if (options.autoescape) {
            words[i] = htmlescape(word, options);
          }
        }
      } else if (safe_input) {
        // Do nothing, as we have no mark_safe.
      } else if (options.autoescape) {
        words[i] = htmlescape(word, options);
      }
    }
    return words.join('');
  }

  urlize.test = {};
  urlize.test.split = split;
  urlize.test.convert_arguments = convert_arguments;

  return urlize;
})();

/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/btoa";
exports.ids = ["vendor-chunks/btoa"];
exports.modules = {

/***/ "(ssr)/./node_modules/btoa/index.js":
/*!************************************!*\
  !*** ./node_modules/btoa/index.js ***!
  \************************************/
/***/ ((module) => {

eval("(function () {\n  \"use strict\";\n\n  function btoa(str) {\n    var buffer;\n\n    if (str instanceof Buffer) {\n      buffer = str;\n    } else {\n      buffer = Buffer.from(str.toString(), 'binary');\n    }\n\n    return buffer.toString('base64');\n  }\n\n  module.exports = btoa;\n}());\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvYnRvYS9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQSxDQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8va3NiLWVycC8uL25vZGVfbW9kdWxlcy9idG9hL2luZGV4LmpzPzE5NGMiXSwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uICgpIHtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgZnVuY3Rpb24gYnRvYShzdHIpIHtcbiAgICB2YXIgYnVmZmVyO1xuXG4gICAgaWYgKHN0ciBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgYnVmZmVyID0gc3RyO1xuICAgIH0gZWxzZSB7XG4gICAgICBidWZmZXIgPSBCdWZmZXIuZnJvbShzdHIudG9TdHJpbmcoKSwgJ2JpbmFyeScpO1xuICAgIH1cblxuICAgIHJldHVybiBidWZmZXIudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICB9XG5cbiAgbW9kdWxlLmV4cG9ydHMgPSBidG9hO1xufSgpKTtcbiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/btoa/index.js\n");

/***/ })

};
;
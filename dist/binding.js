'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Neo4jGraphQLBinding = undefined;

var _graphqlBinding = require('graphql-binding');

var _graphqlTools = require('graphql-tools');

var _link = require('./link.js');

var _typedefs = require('./typedefs.js');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Neo4jGraphQLBinding = exports.Neo4jGraphQLBinding = function (_Binding) {
  _inherits(Neo4jGraphQLBinding, _Binding);

  function Neo4jGraphQLBinding(_ref) {
    var typeDefs = _ref.typeDefs,
        driver = _ref.driver,
        log = _ref.log,
        indexConfig = _ref.indexConfig;

    _classCallCheck(this, Neo4jGraphQLBinding);

    return _possibleConstructorReturn(this, (Neo4jGraphQLBinding.__proto__ || Object.getPrototypeOf(Neo4jGraphQLBinding)).call(this, {
      schema: (0, _graphqlTools.makeRemoteExecutableSchema)({
        schema: typeDefs,
        link: (0, _link.neo4jGraphQLLink)({
          typeDefs: typeDefs,
          driver: driver,
          log: log,
          indexConfig: indexConfig
        })
      })
    }));
  }

  return Neo4jGraphQLBinding;
}(_graphqlBinding.Binding);
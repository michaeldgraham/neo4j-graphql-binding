"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getOperationTypes = exports.buildTypeDefs = undefined;

var _graphql = require("graphql");

var buildTypeDefs = exports.buildTypeDefs = function buildTypeDefs(_ref) {
  var typeDefs = _ref.typeDefs,
      query = _ref.query,
      mutation = _ref.mutation;

  var parsed = (0, _graphql.parse)(typeDefs);
  var buildQueries = typeof query === "boolean" ? query : true;
  var buildMutations = typeof mutation === "boolean" ? mutation : true;
  var typeMaps = buildTypeMaps(parsed);
  parsed = possiblyBuildSchemaDefinition(parsed, typeMaps, buildQueries, buildMutations);
  parsed = possiblyBuildOperationTypes(parsed, typeMaps, buildQueries, buildMutations);
  var operationMaps = buildOperationMap(parsed);
  parsed = buildTypes(parsed, typeMaps, operationMaps);
  return (0, _graphql.print)(parsed);
};
var getOperationTypes = exports.getOperationTypes = function getOperationTypes(parsed) {
  var arr = parsed ? parsed.definitions : [];
  var len = arr.length;
  var i = 0;
  var obj = {};
  var query = false;
  var mutation = false;
  for (; i < len; ++i) {
    obj = arr[i];
    if (isObjectType(obj)) {
      if (obj.name.value === "Query") {
        query = obj;
      } else if (obj.name.value === "Mutation") {
        mutation = obj;
      }
    }
  }
  return {
    query: query,
    mutation: mutation
  };
};
var buildTypes = function buildTypes(parsed, typeMaps, operationMaps) {
  var types = typeMaps.types;
  var models = typeMaps.models;
  var queries = operationMaps.queries;
  var mutations = operationMaps.mutations;
  var arr = Object.keys(models);
  var i = 0;
  var obj = {};
  var key = "";
  var len = arr.length;
  var orderingType = {};
  var modelType = {};
  var queryType = {};
  var mutationType = {};
  for (; i < len; ++i) {
    key = arr[i];
    obj = models[key];
    if (queries && queries.fieldMap && !queries.fieldMap[key]) {

      modelType = buildModelType(key, obj.def, models);
      parsed.definitions[obj.index] = modelType;

      orderingType = buildOrderingType(key, obj.def, models);
      parsed.definitions.push(orderingType);

      queryType = buildQueryType(key, obj.def, models);
      parsed.definitions[queries.index].fields.push(queryType);
    }
    if (mutations && mutations.fieldMap && !mutations.fieldMap["create" + key]) {
      mutationType = buildMutationType(key, obj.def, models);
      parsed.definitions[mutations.index].fields.push(mutationType);
    }
  }
  return parsed;
};
var buildTypeMaps = function buildTypeMaps(parsed) {
  var arr = parsed ? parsed.definitions : [];
  var len = arr.length;
  var i = 0;
  var definition = {};
  var name = "";
  var models = {};
  var types = {};
  for (; i < len; ++i) {
    definition = arr[i];
    if (isObjectType(definition)) {
      if (isModel(definition)) {
        definition = reduceNestedListTypes(definition);
        models[definition.name.value] = {
          index: i,
          def: definition
        };
      } else if (definition.name.value !== "Query" && definition.name.value !== "Mutation") {
        types[definition.name.value] = {
          index: i,
          def: definition
        };
      }
    }
  }
  return {
    models: models,
    types: types
  };
};
var isObjectType = function isObjectType(def) {
  return def && def.kind === "ObjectTypeDefinition";
};
var isModel = function isModel(def) {
  var directives = def.directives ? def.directives : [];
  var len = directives.length;
  var d = 0;
  var directive = {};
  var name = "";
  var isModel = false;
  for (; d < len; ++d) {
    directive = directives[d];
    name = directive.name.value;
    if (name === "model") {
      isModel = true;
    }
  }
  return isModel;
};
var possiblyBuildSchemaDefinition = function possiblyBuildSchemaDefinition(parsed, typeMaps, queries, mutations) {
  if (Object.keys(typeMaps.models).length > 0) {
    var schemaDefinition = getSchemaDefinition(parsed);
    if (schemaDefinition && schemaDefinition.def && schemaDefinition.index >= 0) {
      var schemaDefOperationIndex = schemaDefinition.index;
      var _operationTypes = schemaDefinition.def.operationTypes;
      var query = false;
      var mutation = false;
      _operationTypes.forEach(function (operation) {
        if (operation.operation === "query" && operation.type.name.value === "Query") {
          query = true;
        } else if (operation.operation === "mutation" && operation.type.name.value === "Mutation") {
          mutation = true;
        }
      });
      if (!query && queries) {
        parsed.definitions[schemaDefOperationIndex].operationTypes.push(buildOperationTypeDefinition({
          operation: "query",
          name: "Query"
        }));
      }
      if (!mutation && mutations) {
        parsed.definitions[schemaDefOperationIndex].operationTypes.push(buildOperationTypeDefinition({
          operation: "mutation",
          name: "Mutation"
        }));
      }
    } else if (schemaDefinition === null) {
      parsed.definitions.push(buildSchemaDefinition({
        query: queries,
        mutation: mutations
      }));
    }
  }
  return parsed;
};

var possiblyBuildOperationTypes = function possiblyBuildOperationTypes(parsed, typeMaps, queries, mutations) {
  if (Object.keys(typeMaps.models).length > 0) {
    var _operationTypes2 = getOperationTypes(parsed);
    if (!_operationTypes2.query && queries) {
      parsed.definitions.push(buildObjectTypeDefinition({
        name: "Query"
      }));
    }
    if (!_operationTypes2.mutation && mutations) {
      parsed.definitions.push(buildObjectTypeDefinition({
        name: "Mutation"
      }));
    }
  }
  return parsed;
};

var reduceNestedListTypes = function reduceNestedListTypes(model) {
  var fields = model.fields;
  var len = fields.length;
  var f = 0;
  var field = {};
  for (; f < len; ++f) {
    field = fields[f];
    if (field.type.kind === "ListType") {
      fields[f] = reduceListTypes(field);
    }
  }
  return model;
};
var buildOperationMap = function buildOperationMap(parsed) {
  var arr = parsed ? parsed.definitions : [];
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = "";
  var queries = {};
  var mutations = {};
  for (; i < len; ++i) {
    obj = arr[i];
    if (isObjectType(obj)) {
      if (obj.name.value === "Query") {
        queries = {
          index: i,
          fieldMap: buildFieldMap(obj.fields)
        };
      } else if (obj.name.value === "Mutation") {
        mutations = {
          index: i,
          fieldMap: buildFieldMap(obj.fields)
        };
      }
    }
  }
  return {
    queries: queries,
    mutations: mutations
  };
};
var getSchemaDefinition = function getSchemaDefinition(parsed) {
  var defs = parsed ? parsed.definitions : [];
  var len = defs.length;
  var i = 0;
  for (; i < len; ++i) {
    if (isSchemaDefinition(defs[i])) {
      return {
        def: defs[i],
        index: i
      };
    }
  }
  return null;
};
var buildSchemaDefinition = function buildSchemaDefinition(_ref2) {
  var query = _ref2.query,
      mutation = _ref2.mutation;

  if (!query && !mutation) return null;
  return {
    "kind": "SchemaDefinition",
    "directives": [],
    "operationTypes": operationTypes({
      query: query,
      mutation: mutation
    })
  };
};
var operationTypes = function operationTypes(_ref3) {
  var query = _ref3.query,
      mutation = _ref3.mutation;

  var operationTypes = [];
  if (query) {
    operationTypes.push(buildOperationTypeDefinition({
      operation: "query",
      name: "Query"
    }));
  }
  if (mutation) {
    operationTypes.push(buildOperationTypeDefinition({
      operation: "mutation",
      name: "Mutation"
    }));
  }
  return operationTypes;
};
var reduceListTypes = function reduceListTypes(field) {
  if (field.type.kind === "ListType" && field.type.type && field.type.type.kind === "ListType") {
    var namedType = getNamedType(field);
    field.type = {
      kind: "ListType",
      type: namedType
    };
  }
  return field;
};
var buildModelFields = function buildModelFields(modelName, definition, models) {
  var modelFields = [{
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": "_id"
    },
    "arguments": [],
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if (isModelType(obj, models)) {
      modelFields.push({
        "kind": "FieldDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "arguments": buildModelFieldArguments(modelName, obj, models),
        "type": type,
        "directives": obj.directives
      });
    } else {
      modelFields.push({
        "kind": "FieldDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "arguments": [],
        "type": type,
        "directives": obj.directives
      });
    }
  }
  return modelFields;
};
var getNamedType = function getNamedType(definition) {
  var type = definition.type;
  while (type.kind !== "NamedType") {
    type = type.type;
  }return type;
};

var getFieldValueType = function getFieldValueType(definition) {
  var kind = definition.type.kind;
  var relatedModelType = "";
  if (kind === "NamedType") {
    relatedModelType = definition.type.name.value;
  } else if (kind === "ListType") {
    relatedModelType = definition.type.type.name.value;
  }
  return relatedModelType;
};
var buildModelFieldArguments = function buildModelFieldArguments(modelName, field, models) {
  var kind = field.type.kind;
  var neo4jArgsForNamedType = [{
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "orderBy"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + modelName + "Ordering"
        }
      }
    },
    "directives": []
  }];
  var neo4jArgsForListType = [{
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "orderBy"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + modelName + "Ordering"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_id"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_ids"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "first"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "offset"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }];
  var relatedModelType = getFieldValueType(field);
  var relatedModel = models[relatedModelType];
  if (relatedModel) {
    var args = [];
    var arr = relatedModel.def.fields;
    var len = arr.length;
    var i = 0;
    var obj = {};
    var name = {};
    var type = {};
    for (; i < len; ++i) {
      obj = arr[i];
      name = obj.name;
      type = obj.type;
      if (!isModelType(obj, models)) {
        args.push({
          "kind": "InputValueDefinition",
          "name": {
            "kind": "Name",
            "value": name.value
          },
          "type": type,
          "directives": []
        });
        args.push({
          "kind": "InputValueDefinition",
          "name": {
            "kind": "Name",
            "value": name.value + "s"
          },
          "type": {
            "kind": "ListType",
            "type": type
          },
          "directives": []
        });
      }
    }
    if (kind === "ListType") {
      args.push.apply(args, neo4jArgsForListType);
    } else if (kind === "NamedType") {
      args.push.apply(args, neo4jArgsForNamedType);
    }
    return args;
  }
  return [];
};
var buildModelType = function buildModelType(key, obj, models) {
  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": key
    },
    "interfaces": [],
    "directives": [],
    "fields": buildModelFields(key, obj, models)
  };
};
var buildQueryTypeArguments = function buildQueryTypeArguments(modelName, definition, models) {
  var args = [];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if (!isModelType(obj, models)) {
      if (type.kind === "NonNullType") {
        type = type.type;
      }
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "type": type,
        "directives": []
      });
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value + "s"
        },
        "type": {
          "kind": "ListType",
          "type": type
        },
        "directives": []
      });
    }
  }
  var neo4jArgs = [{
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "orderBy"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "_" + modelName + "Ordering"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_id"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "_ids"
    },
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": "Int"
        }
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "first"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }, {
    "kind": "InputValueDefinition",
    "name": {
      "kind": "Name",
      "value": "offset"
    },
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "Int"
      }
    },
    "directives": []
  }];
  args.push.apply(args, neo4jArgs);
  return args;
};
var buildQueryType = function buildQueryType(key, obj, models) {
  return {
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": key
    },
    "arguments": buildQueryTypeArguments(key, obj, models),
    "type": {
      "kind": "ListType",
      "type": {
        "kind": "NamedType",
        "name": {
          "kind": "Name",
          "value": key
        }
      }
    },
    "directives": []
  };
};
var buildMutationTypeArguments = function buildMutationTypeArguments(modelName, definition, models) {
  var args = [];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    type = obj.type;
    if (!isModelType(obj, models)) {
      args.push({
        "kind": "InputValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value
        },
        "type": type,
        "directives": []
      });
    }
  }
  return args;
};
var buildMutationType = function buildMutationType(key, obj, models) {
  return {
    "kind": "FieldDefinition",
    "name": {
      "kind": "Name",
      "value": "create" + key
    },
    "arguments": buildMutationTypeArguments(key, obj, models),
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": "String"
      }
    },
    "directives": []
  };
};
var buildEnumValues = function buildEnumValues(definition, models) {
  var values = [];
  var arr = definition.fields;
  var len = arr.length;
  var i = 0;
  var obj = {};
  var name = {};
  var type = {};
  for (; i < len; ++i) {
    obj = arr[i];
    name = obj.name;
    if (!isModelType(obj, models)) {
      values.push({
        "kind": "EnumValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value + "_asc"
        },
        "directives": []
      });
      values.push({
        "kind": "EnumValueDefinition",
        "name": {
          "kind": "Name",
          "value": name.value + "_desc"
        },
        "directives": []
      });
    }
  }
  return values;
};
var buildOrderingType = function buildOrderingType(key, obj, models) {
  return {
    "kind": "EnumTypeDefinition",
    "name": {
      "kind": "Name",
      "value": "_" + key + "Ordering"
    },
    "directives": [],
    "values": buildEnumValues(obj, models)
  };
};
var buildFieldMap = function buildFieldMap(arr) {
  var len = arr.length;
  var i = 0;
  var obj = {};
  var fieldMap = {};
  for (; i < len; ++i) {
    obj = arr[i];
    fieldMap[obj.name.value] = obj;
  }
  return fieldMap;
};
var buildObjectTypeDefinition = function buildObjectTypeDefinition(_ref4) {
  var name = _ref4.name;

  return {
    "kind": "ObjectTypeDefinition",
    "name": {
      "kind": "Name",
      "value": name
    },
    "interfaces": [],
    "directives": [],
    "fields": []
  };
};
var buildOperationTypeDefinition = function buildOperationTypeDefinition(_ref5) {
  var operation = _ref5.operation,
      name = _ref5.name;

  return {
    "kind": "OperationTypeDefinition",
    "operation": operation,
    "type": {
      "kind": "NamedType",
      "name": {
        "kind": "Name",
        "value": name
      }
    }
  };
};
var isSchemaDefinition = function isSchemaDefinition(def) {
  return def && def.kind === "SchemaDefinition";
};
var isModelType = function isModelType(field, models) {
  return models[getFieldValueType(field)];
};
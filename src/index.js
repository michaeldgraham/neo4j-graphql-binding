import { parse, print } from 'graphql';
import { getModelFieldMaps } from './link.js';
import { Neo4jGraphQLBinding } from './binding.js';
import { buildTypeDefs, buildOperationMap, buildTypeMaps, buildResolvers } from './typedefs.js';

export const neo4jAssertConstraints = async ({ driver, typeDefs, log }) => {
  if(driver && typeDefs) {
    const constraints = buildAssertionArguments(typeDefs);
    const session = driver.session();
    return await session
      .run(`CALL apoc.schema.assert({indexes}, {constraints}) YIELD label, key, unique, action RETURN { label: label, key: key, unique: unique, action: action }`, {
        indexes: {},
        constraints: constraints
      })
      .then(function (result) {
        if(log) logAssertionResult(result);
        return result;
        session.close();
      })
      .catch(function (error) {
        console.error(error);
      });
  }
};
export const neo4jIDL = async ({ driver, typeDefs, log }) => {
  if(driver && typeDefs) {
    const cleanedTypeDefs = cleanCypherStatements(typeDefs);
    const remoteTypeDefs = buildTypeDefs({
      typeDefs: cleanedTypeDefs,
      query: false,
      mutation: true,
      isForRemote: true
    });
    const session = driver.session();
    return await session
      .run(`CALL graphql.idl({schema}) YIELD value RETURN value`, {schema: remoteTypeDefs})
      .then(function (result) {
        if(log) logIDLResult(result);
        return result;
        session.close();
      })
      .catch(function (error) {
        console.error(error);
      });
  }
};
export const neo4jGraphQLBinding = (config) => {
  return new Neo4jGraphQLBinding(config);
};
export const neo4jExecute = (params, ctx, info, binding) => {
  if(typeof binding !== "string") binding = "neo4j";
  switch(info.parentType.name) {
    case "Query": {
      return ctx[binding].query[info.fieldName](params, info);
    }
    case "Mutation": {
      return ctx[binding].mutation[info.fieldName](params, info);
    }
    case 'Subscription': {
      throw Error(`Subscriptions not yet supported by neo4j-graphql-binding`);
    }
  }
  throw Error(`Unsupported value for parentType.name`);
}
export const buildNeo4jTypeDefs = buildTypeDefs;
export const buildNeo4jResolvers = buildResolvers;
const buildAssertionArguments = (typeDefs) => {
  const parsed = parse(typeDefs);
  const models =  buildTypeMaps(parsed).models;
  let fields = [];
  let modelFieldConstraintMap = {};
  let uniqueProperties = [];
  Object.keys(models).forEach(modelName => {
    fields = models[modelName].def.fields;
    uniqueProperties = getModelFieldMaps(fields).uniqueProperties;
    if(uniqueProperties.indexOf("id") === -1) { uniqueProperties.push('id'); }
    modelFieldConstraintMap[modelName] = uniqueProperties;
  });
  return modelFieldConstraintMap;
}
const formatAssertionResult = (result) => {
  let fieldMap = {};
  let formatted = {};
  let label = "";
  let key = "";
  result.records.forEach(record => {
    fieldMap = record._fields[0];
    label = fieldMap.label;
    key = fieldMap.key;
    if(!formatted[label]) formatted[label] = {};
    formatted[label][key] = {
      action: fieldMap.action,
      unique: fieldMap.unique
    }
  });
  return formatted;
}
const isMutationType = (definition) => {
  return definition.kind === "ObjectTypeDefinition" && definition.name.value === "Mutation";
}
const cleanCypherStatement = (directive) => {
  const args = directive.arguments;
  args.forEach(arg => {
    if(arg.name && arg.name.value === "statement" && arg.value.block === true) {
      arg.value.block = false;
      arg.value.value = arg.value.value.replace(/\n/g, " ");
    }
  });
  return args;
}
const cleanCypherStatements = (typeDefs) => {
  const parsed = parse(typeDefs);
  const operationMaps = buildOperationMap(parsed);
  const typeMaps = buildTypeMaps(parsed);
  const models = typeMaps.models;
  const mutations = operationMaps.mutations;
  if(mutations) {
    const mutationsIndex = mutations.index;
    const cleanedFields = [];
    Object.keys(mutations.fieldMap).forEach(mutationName => {
      mutations.fieldMap[mutationName].directives.forEach(directive => {
        if(directive.name.value === "cypher") {
          directive.arguments = cleanCypherStatement(directive);
        }
      });
      cleanedFields.push(mutations.fieldMap[mutationName]);
    });
    parsed.definitions[mutationsIndex].fields = cleanedFields;
  }

  const queries = operationMaps.queries;
  if(queries) {
    const queriesIndex = queries.index;
    const cleanedFields = [];
    Object.keys(queries.fieldMap).forEach(queryName => {
      queries.fieldMap[queryName].directives.forEach(directive => {
        if(directive.name.value === "cypher") {
          directive.arguments = cleanCypherStatement(directive);
        }
      });
      cleanedFields.push(queries.fieldMap[queryName]);
    });
    parsed.definitions[queriesIndex].fields = cleanedFields;
  }

  if(models) {
    const cleanedFields = [];
    let model = {};
    let directives = [];
    Object.keys(models).forEach(modelName => {
      model = models[modelName];
      model.def.fields.forEach(field => {
        field.directives.forEach(directive => {
          if(directive.name.value === "cypher") {
            directive.arguments = cleanCypherStatement(directive);
          }
          else if(directive.name.value === "unique") {
            // For now, change @unique to @isUnique
            directive.name.value = "isUnique";
          }
        });
      });
      parsed.definitions[model.index].fields = model.def.fields;
    });
  }
  return print(parsed);
};
const logAssertionResult = (result) => {
  console.log(`
--- BEGIN neo4jAssertConstraints ---
${JSON.stringify(formatAssertionResult(result), null, 2)}
--- END neo4jAssertConstraints ---
  `);
}
const logIDLResult = (result) => {
  console.log(`
--- BEGIN neo4jIDL ---
${result.records[0]._fields[0]}
--- END neo4jIDL ---
  `);
}

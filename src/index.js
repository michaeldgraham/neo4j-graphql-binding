import { buildTypeDefs } from './typedefs.js';
import { Neo4jGraphQLBinding } from './binding.js';
import { parse, print } from 'graphql';

export const buildNeo4jTypeDefs = buildTypeDefs;
export const neo4jGraphqlBinding = Neo4jGraphQLBinding;
export const neo4jGraphQLBinding = ({ typeDefs, driver, log }) => {
  log = typeof log === 'boolean' ? log : false;
  return new Neo4jGraphQLBinding({
    typeDefs: typeDefs,
    driver: driver,
    log: log
  });
};
export const neo4jExecute = (params, ctx, info) => {
  switch(info.parentType.name) {
    case "Mutation": {
      ctx.operationName = info.fieldName;
      return ctx.neo4j.mutation[info.fieldName](params, info, {
        context: ctx
      });
    }
    case "Query": {
      ctx.operationName = info.fieldName;
      return ctx.neo4j.query[info.fieldName](params, info, {
        context: ctx
      });
    }
    case 'Subscription': {
      throw Error(`Subscriptions not yet supported by neo4j-graphql-binding`);
    }
  }
  throw Error(`Unsupported value for parentType.name`);
}
export const neo4jIDL = async (driver, typeDefs) => {
  if(driver && typeDefs) {
    const session = driver.session();
    return await session
      .run('CALL graphql.idl({schema})', {schema: oneLineBlockCypherStatements(typeDefs)})
      .then(function (result) {
        session.close();
        return result.records[0]._fields[0]
      })
      .catch(function (error) {
        console.error(error);
      });
  }
};

const isMutationType = (definition) => {
  return definition.kind === "ObjectTypeDefinition" && definition.name.value === "Mutation";
}
const cleanCypherStatement = (args) => {
  const len = args ? args.length : 0;
  let a = 0;
  let arg = {};
  let statement = "";
  for(; a < len; ++a) {
    arg = args[a];
    if(arg.name && arg.name.value === "statement" && arg.value.block === true) {
      arg.value.block = false;
      arg.value.value = arg.value.value.replace(/\n/g, " ");
    }
  }
  return args;
}
const oneLineBlockCypherStatements = (typeDefs) => {
  const parsed = parse(typeDefs);
  const mutationTypeInfo = getMutationTypeInfo(parsed, typeDefs);
  const mutations = mutationTypeInfo.fields;
  const mutationsIndex = mutationTypeInfo.index;
  let directives = [];
  let d = 0;
  let len = 0;
  let directive = {};
  let dirArguments = [];
  let statement = "";
  const cleanedMutations = mutations.map(obj => {
    directives = obj.directives;
    len = directives.length;
    for(d = 0; d < len; ++d) {
      directive = directives[d];
      if(directive.name.value === "cypher") {
        dirArguments = directive.arguments;
        directive.arguments = cleanCypherStatement(dirArguments);
      }
    }
    return obj;
  });
  parsed.definitions[mutationsIndex].fields = cleanedMutations;
  return print(parsed);
};
const getMutationTypeInfo = (parsed, typeDefs) => {
  if(parsed.kind === "Document") {
    const defs = parsed.definitions;
    const len = defs.length;
    let d = 0;
    let def = {};
    let defFields = [];
    for(; d < len; ++d) {
      def = defs[d];
      if(isMutationType(def)) {
        return {
          fields: def.fields,
          index: d
        };
      }
    }
  }
  return {};
}

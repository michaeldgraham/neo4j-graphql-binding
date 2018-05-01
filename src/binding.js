import { parse } from 'graphql';
import { getOperationTypes } from './typedefs.js';

export const buildBindings = ({ typeDefs, binding, log }) => {
  const parsed = parse(typeDefs);
  const operationTypes = getOperationTypes(parsed);
  const queries = operationTypes.query;
  let wrappers = {
    query: {},
    mutation: {}
  };
  let fieldName = "";
  queries.fields.forEach(field => {
    fieldName = field.name.value;
    wrappers.query[fieldName] = queryBindingWrapper(fieldName, binding, log);
  });
  const mutations = operationTypes.mutation;
  mutations.fields.forEach(field => {
    fieldName = field.name.value;
    wrappers.mutation[fieldName] = mutationBindingWrapper(fieldName, binding, log);
  });
  return wrappers;
};

const queryBindingWrapper = (fieldName, binding, log) => {
  return function(params, ctx, info) {
    ctx.localInfo = info;
    ctx.requestType = "query";
    ctx.logRequests = log;
    return binding.query[fieldName](params, ctx, info);
  }
};
const mutationBindingWrapper = (fieldName, binding, log) => {
  return function(params, ctx, info) {
    ctx.localInfo = info;
    ctx.requestType = "mutation";
    ctx.logRequests = log;
    return binding.mutation[fieldName](params, ctx, info);
  }
};

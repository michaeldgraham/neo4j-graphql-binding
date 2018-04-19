# neo4j-graphql-binding

### Overview
<code>neo4j-graphql-binding</code> provides a quick way to embed a [Neo4j Graph Database](https://neo4j.com/product/) GraphQL API (using the [neo4j-graphql](https://github.com/neo4j-graphql/neo4j-graphql) plugin) into your local GraphQL server.

The same <code>typeDefs</code> are used for both your Neo4j GraphQL server and your local GraphQL server. In your server setup, you use <code>neo4jGraphQLBinding</code> to create a [GraphQL binding](https://www.npmjs.com/package/graphql-binding) to your Neo4j server and set the binding into your request context. The binding can then be accessed in your local resolvers to send requests to your remote Neo4j GraphQL server for any <code>query</code> or <code>mutation</code> in your <code>typeDefs</code> with a [@cypher directive](https://neo4j.com/developer/graphql/#_neo4j_graphql_extension).

You can use <code>neo4jExecute</code> as a helper for using the binding. If you delegate the processing of a local resolver entirely to your Neo4j GraphQL server, then you only use the binding once in that resolver and have to repeat its name. <code>neo4jExecute</code> automates this away for you by obtaining request information from the local resolver's [info](https://blog.graph.cool/graphql-server-basics-demystifying-the-info-argument-in-graphql-resolvers-6f26249f613a) argument.

### Installation and usage

	npm install --save neo4j-graphql-binding

In your local GraphQL server setup, <code>neo4jGraphQLBinding</code> is used with your schema's <code>typeDefs</code> and your [Neo4j driver](https://www.npmjs.com/package/neo4j-driver) to create a GraphQL binding to your Neo4j Graphql server. The binding is then set into the server's request context at the path <code>.neo4j</code>:
```js
import { GraphQLServer } from 'graphql-yoga';
import { makeExecutableSchema } from 'graphql-tools';
import { v1 as neo4j } from 'neo4j-driver';

import { neo4jGraphQLBinding } from 'neo4j-graphql-binding';
import { typeDefs, resolvers } from './schema.js';

const driver = neo4j.driver("bolt://localhost", neo4j.auth.basic("user", "password"));

const localSchema = makeExecutableSchema({
  typeDefs: typeDefs,
  resolvers: resolvers
});

const neo4jGraphqlAPI = neo4jGraphQLBinding({
  typeDefs: typeDefs,
  driver: driver
});

const server = new GraphQLServer({
  schema: localSchema,
  context: {
    neo4j: neo4jGraphqlAPI
  }
});

const options = {
  port: 4000,
  endpoint: '/graphql',
  playground: '/playground',
};

server.start(options, ({ port }) => {
  console.log(`Server started, listening on port ${port} for incoming requests.`)
});

```
In your schema, the binding is accessed to send a request to your Neo4j Graphql server to process any <code>query</code> or <code>mutation</code> in your <code>typeDefs</code> that has a <code>@cypher</code> directive.
Note that the @cypher directive on the createPerson mutation formats its return data into a JSON that matches the custom payload type createPersonPayload. This is possible with some Cypher features released in Neo4j 3.1 (see: https://neo4j.com/blog/cypher-graphql-neo4j-3-1-preview/).

<code>schema.js</code>
```js
export const typeDefs = `
  type Person {
    name: String
    friends: [Person] @relation(
      name: "friend",
      direction: OUT
    )
  }

  type Query {
    readPeople(name: String!): [Person]
      @cypher(statement: "MATCH (p:Person {name: $name}) RETURN p")
  }

  input createPersonInput {
    name: String!
  }

  type createPersonPayload {
    name: String
  }

  type Mutation {
    createPerson(person: createPersonInput!): createPersonPayload
      @cypher(statement: "CREATE (p:Person) SET p += $person RETURN p{ .name } AS createPersonPayload")
  }

  schema {
    query: Query
    mutation: Mutation
  }
`;

export const resolvers = {
  Query: {
    readPeople: (obj, params, ctx, info) => {
      return ctx.neo4j.query.readPeople(params, ctx, info);
    }
  },
  Mutation: {
    createPerson: (obj, params, ctx, info) => {
      return ctx.neo4j.mutation.createPerson(params, ctx, info);
    }
  }
};
```

If you use the binding to call a remote resolver of the same name as the local resolver it's called in, you can use <code>neo4jExecute</code> to avoid repeating the resolver name:

```js
import { neo4jExecute } from 'neo4j-graphql-binding';

export const resolvers = {
  Query: {
    readPeople: (obj, params, ctx, info) => {
      return neo4jExecute(params, ctx, info);
    }
  },
  Mutation: {
    createPerson: (obj, params, ctx, info) => {
      return neo4jExecute(params, ctx, info);
    }
  }
}
```

Handling return data using async / await:
```js
Query: {
  readPeople: async (obj, params, ctx, info) => {
    const data = await neo4jExecute(params, ctx, info);
    // post-process data, send subscriptions, etc.
    return data;
  }
}
```
#### Request Examples
<code>readPeople.graphql</code>
```js
query readPeople($name: String!) {
  readPeople(name: $name) {
    name
    friends {
      name
    }
  }
}
```
result:
```json
{
  "data":{
    "readPeople": [
      {
        "name": "Michael",
        "friends": [
          {
            "name": "Marie",
            "__typename": "Person"
          }
        ],
        "__typename":"Person"
      }
    ]
  }
}
```
<code>createPerson.graphql</code>
```js
mutation createPerson($person: createPersonInput!) {
  createPerson(person: $person) {
    name
  }
}
```
result:
```json
{
  "data":{
    "createPerson": {
      "name": "Michael",
      "__typename":"Person"
    }
  }
}
```

### License
The code is available under the [MIT](LICENSE) license.

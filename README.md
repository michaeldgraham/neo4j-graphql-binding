# neo4j-graphql-binding


## Overview

In your server setup, you use can <code>neo4jGraphQLBinding</code> to create a [GraphQL binding](https://www.npmjs.com/package/graphql-binding) to the schema used by your Neo4j instance. The binding is set into your server's context object at some key and accessed in your resolvers to delegate requests for any generated <code>query</code> or <code>mutation</code> or those which use a [@cypher directive](https://neo4j.com/developer/graphql/#_neo4j_graphql_extension).

The exports of this package are used to support various features in [neo4j-graphql-server](https://www.npmjs.com/package/neo4j-graphql-server). See this section explaining the [server setup process](https://neo4j-graphql-server.gitbook.io/docs/neo4j-graphql-server#strategy).

<i>neo4j-graphql-binding is still under development, so please file an issue for any bug you discover or share feature requests. Thanks!</i>

## Install

<code>
npm install -save neo4j-graphql-binding
</code>

## [Docs 📚](https://neo4j-graphql-server.gitbook.io/docs/neo4j-graphql-binding)
View the docs [here](https://neo4j-graphql-server.gitbook.io/docs/neo4j-graphql-binding)!

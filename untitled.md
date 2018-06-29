# Overview

This project is an attempt to explore and integrate current resources for using GraphQL with Neo4j Graph Databases. Much has already been done in this direction. 

As part of the [GRANDstack](https://grandstack.io/), Neo4j has developed an extension named [Neo4j-GraphQL](https://github.com/neo4j-graphql/neo4j-graphql), which exposes an auto-generated GraphQL API and custom procedures for updating the schema and running operations.   
  
[Prisma](https://www.prisma.io/) has developed GraphQL Bindings, a useful way for embedding remote GraphQL APIs within your own server.  
  
The current strategy of this package is to create a custom GraphQL binding over the schema created by `makeRemoteExecutableSchema`from `graphql-tools` , using your local `typeDefs`and a custom Apollo Link.   
  
When you send a GraphQL request to a resolver that delegates to the binding, the link receives the operation, processes it to support various features, and finally uses the Bolt driver to send a Cypher request to your Neo4j-GraphQL endpoint. The Cypher request wraps the GraphQL operation into a call to a custom procedure provided by the neo4j-graphql extension \(`graphql.query` for queries and `graphql.execute`for mutations\).

### Resources

* GRANDstack --  Build full stack graph applications with ease [https://grandstack.io/](https://grandstack.io/) 
* Neo4j-GraphQL Extension --  A GraphQL-Endpoint extension for Neo4j [https://github.com/neo4j-graphql/neo4j-graphql](https://github.com/neo4j-graphql/neo4j-graphql) 
* What are GraphQL Bindings? [https://www.prisma.io/blog/graphql-binding-2-0-improved-api-schema-transforms-automatic-codegen-5934cd039db1/](https://www.prisma.io/blog/graphql-binding-2-0-improved-api-schema-transforms-automatic-codegen-5934cd039db1/)
*  Open Source Prisma Resources [https://oss.prisma.io](https://oss.prisma.io/)/ 
* Apollo Link -- Composable networking for GraphQL [https://www.apollographql.com/docs/link/](https://www.apollographql.com/docs/link/) 

state that there are some examples for a version of the grandstack starter and using the GraphQL Community Data server, provide examples in those spaces


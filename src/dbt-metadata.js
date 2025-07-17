// src/dbt-metadata.js

/**
 * Simulação de uma parte do manifest.json do dbt.
 * Contém a definição dos modelos, suas colunas e descrições.
 */
export const manifest = {
  nodes: {
    "model.my_project.stg_customers": {
      unique_id: "model.my_project.stg_customers",
      resource_type: "model",
      name: "stg_customers",
      columns: {
        customer_id: {
          name: "customer_id",
          description: "Chave primária da tabela de clientes.",
        },
        first_name: {
          name: "first_name",
          description: "Primeiro nome do cliente.",
        },
        last_name: {
          name: "last_name",
          description: "Sobrenome do cliente.",
        },
      },
    },
    "model.my_project.stg_orders": {
      unique_id: "model.my_project.stg_orders",
      resource_type: "model",
      name: "stg_orders",
      columns: {
        order_id: {
          name: "order_id",
          description: "Chave primária da tabela de pedidos.",
        },
        customer_id: {
          name: "customer_id",
          description: "Chave estrangeira para a tabela de clientes.",
        },
        order_date: {
          name: "order_date",
          description: "Data em que o pedido foi realizado.",
        },
        status: {
          name: "status",
          description: "Status atual do pedido.",
        },
      },
    },
    // NOVA TABELA - TERCEIRA CAMADA
    "model.my_project.customers": {
        unique_id: "model.my_project.customers",
        resource_type: "model",
        name: "customers",
        columns: {
          customer_id: {
            name: "customer_id",
            description: "Chave primária da tabela de clientes.",
          },
          full_name: {
            name: "full_name",
            description: "Nome completo do cliente (concatenado).",
          },
          total_orders: {
            name: "total_orders",
            description: "Número total de pedidos feitos pelo cliente."
          }
        },
      },
  },
};

/**
 * Simulação de uma parte do catalog.json do dbt.
 * Contém o esquema do banco de dados, como os tipos de dados das colunas.
 */
export const catalog = {
  nodes: {
    "model.my_project.stg_customers": {
      metadata: { type: "BASE TABLE", schema: "raw", name: "stg_customers" },
      columns: {
        customer_id: { type: "INTEGER", index: 1, name: "customer_id" },
        first_name: { type: "VARCHAR", index: 2, name: "first_name" },
        last_name: { type: "VARCHAR", index: 3, name: "last_name" },
      },
    },
    "model.my_project.stg_orders": {
      metadata: { type: "BASE TABLE", schema: "raw", name: "stg_orders" },
      columns: {
        order_id: { type: "INTEGER", index: 1, name: "order_id" },
        customer_id: { type: "INTEGER", index: 2, name: "customer_id" },
        order_date: { type: "DATE", index: 3, name: "order_date" },
        status: { type: "VARCHAR", index: 4, name: "status" },
      },
    },
    // METADADOS DA NOVA TABELA
    "model.my_project.customers": {
        metadata: { type: "TABLE", schema: "analytics", name: "customers" },
        columns: {
          customer_id: { type: "INTEGER", index: 1, name: "customer_id" },
          full_name: { type: "VARCHAR", index: 2, name: "full_name" },
          total_orders: { type: "INTEGER", index: 3, name: "total_orders" },
        },
      },
  },
};
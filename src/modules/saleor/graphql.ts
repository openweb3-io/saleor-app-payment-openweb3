// Saleor GraphQL 创建用户 mutation
export const ACCOUNT_REGISTER_MUTATION = `
  mutation AccountRegisterInput($input: AccountRegisterInput!) {
    accountRegister(input: $input) {
      requiresConfirmation
      errors {
        field
        message
        addressType
      }
      user {
        id
        isActive
        isConfirmed
      }
    }
  }
`;

// Saleor GraphQL 查询用户 mutation
export const USER_QUERY = `
  query User($email: String) {
    user(email: $email) {
      id
      email
    }
  }
`;

// Saleor GraphQL 获取用户 token mutation
export const TOKEN_CREATE_MUTATION = `
  mutation TokenCreate($email: String!, $password: String!) {
    tokenCreate(email: $email, password: $password) {
      token
      refreshToken
      csrfToken
      user {
        id
        email
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

// 交易查询
export const TRANSACTION_QUERY = `
  query Transaction($transactionId: ID!) {
    transaction(id: $transactionId) {
      checkout {
        id
      }
      order {
        id
      }
      status
      type
      isSuccess
      chargedAmount {
        amount
        currency
      }
      createdAt
    }
  }
`;

// 交易处理 mutation
export const TRANSACTION_PROCESS_MUTATION = `
  mutation transactionProcess ($data: JSON!, $id: ID!)  {
    transactionProcess(data: $data, id: $id) {
      transaction {
        id
        chargedAmount{
          amount
          currency
        }
        createdAt
      }
      transactionEvent {
        type
        pspReference
        message
        externalUrl
        id
        amount{
          amount
          currency
        }
        idempotencyKey
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

// 完成结账 mutation
export const CHECKOUT_COMPLETE_MUTATION = `
  mutation checkoutComplete($id: ID!) {
    checkoutComplete(id: $id) {
      order {
        id
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

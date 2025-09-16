# Projeto E-commerce Olomi

Este é um projeto de e-commerce completo construído com HTML, CSS e JavaScript puro (Vanilla JS), utilizando o Firebase como um backend abrangente (BaaS - Backend as a Service). A plataforma foi desenvolvida de forma modular e inclui funcionalidades essenciais tanto para clientes quanto para administradores.

## Visão Geral

A Olomi é uma loja virtual focada em artigos africanos e religiosos. Os clientes podem navegar por um catálogo dinâmico, pesquisar produtos, adicioná-los ao carrinho e gerenciar as suas contas e pedidos. Em paralelo, um painel de administração protegido permite a gestão completa de produtos e o acompanhamento de pedidos.

## Tecnologias Utilizadas

- **Frontend:**
  - HTML5
  - CSS3 (com Variáveis CSS para um design coeso)
  - JavaScript (ES6+), organizado em módulos para melhor manutenibilidade.

- **Backend (Firebase):**
  - **Firebase Authentication:** Para autenticação segura de clientes e administradores (login com e-mail e senha).
  - **Firestore:** Como banco de dados NoSQL para armazenar informações de produtos, pedidos, utilizadores e controle de acesso (roles).
  - **Firebase Storage:** Para o upload e armazenamento das imagens dos produtos.

## Estrutura do Projeto

O projeto está organizado de forma lógica para separar as responsabilidades:

```
/public
|-- /assets/          # Imagens estáticas (logo, etc.)
|-- /css/             # Ficheiros de estilo (style.css)
|-- /js/              # Todos os scripts JavaScript
|   |-- admin.js        # Lógica do painel de admin
|   |-- catalogo.js     # Lógica da página inicial (catálogo)
|   |-- carrinho.js     # Lógica da página do carrinho
|   |-- produto.js      # Lógica da página de detalhe do produto
|   |-- auth.js         # Funções de autenticação
|   |-- main.js         # Script principal (cabeçalho, navegação)
|   |-- firebase.js     # Configuração e inicialização do Firebase
|   |-- utils.js        # Funções utilitárias (formatação, cart store)
|   `-- ...           # Outros scripts modulares
|
|-- admin.html          # Painel de Administração
|-- carrinho.html       # Página do carrinho de compras
|-- index.html          # Página inicial (catálogo de produtos)
|-- produto.html        # Página de detalhe do produto
|-- login-cliente.html  # Página de login
|-- minha-conta.html    # Página do cliente com histórico de pedidos
`-- ...               # Outras páginas HTML
```

## Funcionalidades

### Para Clientes:

- **Autenticação Completa:** Cadastro, login e gestão de sessão.
- **Catálogo Dinâmico:** Navegação, pesquisa textual e filtro por categorias.
- **Visualização de Produto:** Página de detalhe para cada item.
- **Carrinho de Compras Persistente:** Adicionar, remover e atualizar a quantidade de itens (persiste no `localStorage`).
- **Feedback ao Utilizador:** Notificações (toasts) para ações como "adicionado ao carrinho".
- **Área "Minha Conta":** Acesso seguro ao histórico de pedidos.

### Para Administradores:

- **Painel Seguro:** Acesso a um painel de administração (`/admin.html`) restrito a utilizadores com a role de "admin".
- **Gestão de Produtos (CRUD):**
  - **Criar:** Adicionar novos produtos com nome, descrição, preço, stock, categoria e imagens.
  - **Ler:** Visualizar todos os produtos numa tabela organizada.
  - **Atualizar:** (Funcionalidade a ser implementada no frontend) Editar produtos existentes.
  - **Deletar:** Remover produtos da loja.
- **Gestão de Pedidos:** Visualizar todos os pedidos feitos pelos clientes e atualizar o seu status (ex: "Pendente" para "Enviado").
- **Criação de Novos Admins:** Uma página dedicada para atribuir a role de administrador a novos utilizadores.

## Como Configurar e Executar o Projeto

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/arthurcmps/olomi.git
    cd olomi
    ```

2.  **Configure o Firebase:**
    - Crie um projeto no [console do Firebase](https://console.firebase.google.com/).
    - Ative os seguintes serviços: **Authentication** (com o provedor "E-mail/Senha"), **Firestore** e **Storage**.
    - Na visão geral do seu projeto, adicione um novo aplicativo da Web (</>).
    - O Firebase fornecerá um objeto de configuração `firebaseConfig`. Copie este objeto.

3.  **Crie o Ficheiro de Configuração:**
    - Na pasta `public/js/`, crie um novo ficheiro chamado `firebase.js`.
    - Cole o objeto `firebaseConfig` e inicialize o Firebase, como no exemplo abaixo:

    ```javascript
    // public/js/firebase.js

    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
    import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
    import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
    import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";

    // Cole aqui o objeto de configuração do seu projeto Firebase
    const firebaseConfig = {
      apiKey: "SUA_API_KEY",
      authDomain: "SEU_AUTH_DOMAIN",
      projectId: "SEU_PROJECT_ID",
      storageBucket: "SEU_STORAGE_BUCKET",
      messagingSenderId: "SEU_MESSAGING_SENDER_ID",
      appId: "SUA_APP_ID"
    };

    // Inicializa o Firebase e exporta os serviços
    const app = initializeApp(firebaseConfig);
    export const db = getFirestore(app);
    export const auth = getAuth(app);
    export const storage = getStorage(app);
    ```

4.  **Execute Localmente:**
    - Como este é um projeto de frontend puro, pode executá-lo com qualquer servidor web estático. Se tiver o VS Code, uma excelente opção é a extensão **Live Server**.
    - Clique com o botão direito no ficheiro `public/index.html` e selecione "Open with Live Server".
    
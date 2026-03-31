# 🌿 Olomi - E-commerce de Artigos Africanos e Religiosos

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)

Uma plataforma de e-commerce completa, desenvolvida sob uma arquitetura **Serverless** orientada a eventos. O projeto foi construído para entregar alta performance, gestão de conteúdo autônoma (CMS) e integrações logísticas e financeiras reais, sem a necessidade de frameworks de frontend pesados.

Este projeto compõe o portfólio de conclusão do curso de Análise e Desenvolvimento de Sistemas, demonstrando a aplicação prática de modelagem NoSQL, transações atômicas e integrações via API.

---

## ✨ Funcionalidades em Destaque

* **Painel de Administração (CMS):** Gestão completa de catálogo, controle de estoque e acompanhamento de status de pedidos em tempo real.
* **Tematização Dinâmica Injetável:** Alteração de cores primárias, logomarca e letreiros promocionais animados diretamente pelo painel admin, com reflexo imediato no site via injeção de `<style>` no DOM.
* **Motor de Descontos e Cupons:** Validação de cupons em tempo real com regras de limite de uso, valor mínimo de compra e abatimento automático na finalização do pedido.
* **Otimização de Imagens no Cliente (Canvas API):** Redimensionamento e compressão de imagens para o formato `.webp` nativamente no navegador antes do upload, poupando banda e custos de Storage.
* **Filtro em Memória (DOM Manipulation):** Busca instantânea de pedidos no painel admin sem onerar o banco de dados com novas requisições de leitura.
* **Integração Logística (SuperFrete):** Cubagem virtual inteligente do carrinho e cálculo de frete (Correios) com declaração de valor para seguro.
* **Checkout Seguro (Mercado Pago):** Geração de preferências de pagamento e processamento automático de status via Webhooks integrados às Cloud Functions.

---

## 🛠️ Arquitetura e Stack Tecnológica

O projeto adota o ecossistema **Google Cloud / Firebase** para infraestrutura:

* **Frontend:** HTML5, CSS3, JavaScript (ES6 Modules). *Client-Side Rendering* focado em velocidade e interatividade nativa.
* **Banco de Dados:** Cloud Firestore (NoSQL).
* **Backend:** Firebase Cloud Functions (Node.js) para orquestração de pagamentos e transações de banco de dados.
* **Autenticação:** Firebase Auth (E-mail/Senha e controle de roles/RBAC).
* **Armazenamento:** Firebase Storage.
* **Hospedagem:** Firebase Hosting com controle avançado de *Cache Busting*.

---

## 🗄️ Estrutura do Banco de Dados (Firestore)

A modelagem NoSQL foi desenhada priorizando leituras assíncronas O(1) e imutabilidade de registros de vendas.

* **`products`**: Catálogo, controle de estoque e dimensões físicas.
* **`orders`**: Histórico estático do pedido (preserva o valor original dos produtos na data da compra, dados do cliente e método de envio).
* **`coupons`**: Regras de negócio de promoções e controle de contagem de uso.
* **`users` / `roles`**: Perfil de clientes e matriz de privilégios administrativos.
* **`settings`**: Configurações globais de UI/UX da loja.

---

## 🔒 Segurança (Firestore Rules & Transações Atômicas)

A integridade do e-commerce é garantida por dois pilares:
1. **Cloud Functions Transactions:** A baixa de estoque e a aplicação de cupons ocorrem dentro de `db.runTransaction()`. Se qualquer etapa falhar (ex: estoque insuficiente na hora H), toda a operação sofre *rollback*.
2. **Security Rules:** O banco de dados bloqueia leituras não autorizadas. Um usuário só pode acessar a coleção `orders` se o `userId` do documento corresponder ao seu próprio UID autenticado. Modificações no catálogo são restritas a usuários listados na coleção `roles` com privilégios de administrador.

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
* [Node.js](https://nodejs.org/) instalado.
* Conta no [Firebase](https://firebase.google.com/) com um projeto configurado (Firestore, Auth, Storage, Functions ativados).
* [Firebase CLI](https://firebase.google.com/docs/cli) instalado globalmente (`npm install -g firebase-tools`).

### Passo a Passo

1. **Clone o repositório**
   ```bash
   git clone [https://github.com/SEU_USUARIO/olomi-ecommerce.git](https://github.com/SEU_USUARIO/olomi-ecommerce.git)
   cd olomi-ecommerce
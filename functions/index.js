const functions = require("firebase-functions");
const axios = require("axios");
const xml2js = require("xml2js");
// Pacote adicionado para lidar com as permissões de CORS
const cors = require("cors")({ origin: true });

// A função foi alterada de 'onCall' para 'onRequest' para um controlo mais fino
exports.calculateShipping = functions.https.onRequest((req, res) => {
  // Envolve a lógica da sua função com o 'cors'
  cors(req, res, async () => {
    // Com 'onRequest', os dados vêm de 'req.body.data'
    const destinationCep = req.body.data.cep;
    if (!destinationCep) {
      res.status(400).send({ error: "O CEP de destino é obrigatório." });
      return;
    }

    const originCep = "21371121";
    const packageWeight = "1";
    const packageLength = "20";
    const packageHeight = "10";
    const packageWidth = "15";

    const correiosUrl = `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?nCdEmpresa=&sDsSenha=&sCepOrigem=${originCep}&sCepDestino=${destinationCep}&nVlPeso=${packageWeight}&nCdFormato=1&nVlComprimento=${packageLength}&nVlAltura=${packageHeight}&nVlLargura=${packageWidth}&sCdMaoPropria=n&nVlValorDeclarado=0&sCdAvisoRecebimento=n&nCdServico=04510&nVlDiametro=0&StrRetorno=xml&nIndicaCalculo=3`;

    try {
      const response = await axios.get(correiosUrl);
      const xml = response.data;

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xml);

      const service = result.Servicos.cServico[0];
      const shippingValue = service.Valor[0].replace(",", ".");
      const deliveryTime = service.PrazoEntrega[0];

      if (service.Erro[0] !== "0") {
        throw new Error(service.MsgErro[0]);
      }

      // Com 'onRequest', a resposta é enviada através de 'res.send()'
      res.status(200).send({
        data: {
          price: parseFloat(shippingValue),
          deadline: parseInt(deliveryTime),
        }
      });
    } catch (error) {
      console.error("Erro ao calcular o frete:", error);
      res.status(500).send({ error: "Não foi possível calcular o frete." });
    }
  });
});

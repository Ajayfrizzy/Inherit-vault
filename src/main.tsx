import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ccc } from "@ckb-ccc/connector-react";
import App from "./App";
import "./index.css";
import { DEFAULT_NETWORK, NETWORK_CONFIGS } from "./config";

// Create CCC client based on default network
const defaultClient =
  DEFAULT_NETWORK === "mainnet"
    ? new ccc.ClientPublicMainnet()
    : new ccc.ClientPublicTestnet();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ccc.Provider
      defaultClient={defaultClient}
      clientOptions={[
        {
          name: NETWORK_CONFIGS.testnet.label,
          client: new ccc.ClientPublicTestnet(),
        },
        {
          name: NETWORK_CONFIGS.mainnet.label,
          client: new ccc.ClientPublicMainnet(),
        },
      ]}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ccc.Provider>
  </React.StrictMode>
);

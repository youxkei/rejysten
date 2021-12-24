const path = require("path");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const WebpackPwaManifest = require("webpack-pwa-manifest");
const WorkboxWebpackPlugin = require("workbox-webpack-plugin");

const isDevelopment = process.env.NODE_ENV !== "production";

module.exports = {
  mode: isDevelopment ? "development" : "production",

  entry: {
    main: "./src/Index.bs.js",
  },

  module: {
    rules: [
      isDevelopment && {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve("babel-loader"),
            options: {
              plugins: [require.resolve("react-refresh/babel")],
            },
          },
        ],
      },
    ].filter(Boolean),
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: "src/index.html",
    }),
    new WebpackPwaManifest({
      name: "rejysten",
      publicPath: ".",
      icons: [
        {
          src: path.resolve("src/rejysten.png"),
          sizes: [96, 128, 192, 256, 384, 512],
        },
      ],
    }),
    new WorkboxWebpackPlugin.GenerateSW({
      clientsClaim: true,
      skipWaiting: true,
    }),
    isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),

  output: {
    path: path.resolve(__dirname, "./dist"),
    filename: "index.js",
  },

  devServer: {
    hot: true,
  },
};

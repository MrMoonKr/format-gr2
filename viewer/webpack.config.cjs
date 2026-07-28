const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

function readLocalAssets()
{
    const file = path.resolve(__dirname, "assets.local.json");
    if (!fs.existsSync(file)) return { assetRoot: null };

    try
    {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    }
    catch
    {
        return { assetRoot: null };
    }
}

module.exports = (env, argv) =>
{
    const isProduction = argv.mode === "production";
    const localAssets = readLocalAssets();

    const staticDirs = [
        { directory: path.resolve(__dirname, "public") }
    ];

    if (localAssets.assetRoot)
    {
        staticDirs.push({
            directory: path.resolve(localAssets.assetRoot),
            publicPath: "/dev-assets/model"
        });
    }

    // Separate from assetRoot: HDRI panoramas for IBL live under the
    // resource-explorer's res/ directory, a different subtree than model/.
    if (localAssets.envRoot)
    {
        staticDirs.push({
            directory: path.resolve(localAssets.envRoot),
            publicPath: "/dev-assets/env"
        });
    }

    return {
        mode: isProduction ? "production" : "development",
        devtool: isProduction ? false : "eval-source-map",
        entry: path.resolve(__dirname, "src/main.js"),
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "[name].[contenthash].js",
            clean: true
        },
        module: {
            rules: [
                { test: /\.css$/, use: [ "style-loader", "css-loader" ] }
            ]
        },
        plugins: [
            new HtmlWebpackPlugin({ template: path.resolve(__dirname, "public/index.html") }),
            new webpack.DefinePlugin({
                __VIEWER_TEST_ASSETS__: JSON.stringify(isProduction ? [] : (localAssets.testAssets ?? [])),
                __VIEWER_ENV_MAP_URL__: JSON.stringify(
                    isProduction || !localAssets.envRoot || !localAssets.envFile
                        ? ""
                        : `/dev-assets/env/${localAssets.envFile}`
                )
            })
        ],
        devServer: {
            port: 8080,
            hot: true,
            static: staticDirs
        }
    };
};

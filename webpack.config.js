const path = require('path');

module.exports = {
    entry: './src/rolls.js',
    output: {
        path: path.resolve(__dirname, 'public/js'),
        filename: 'rolls-bundle.js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader"
                }
            }
        ]
    }
};

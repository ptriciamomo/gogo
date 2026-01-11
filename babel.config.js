module.exports = function (api) {
    api.cache(true);
    return {
        presets: ["babel-preset-expo"], // includes expo-router support
        plugins: [
            "react-native-worklets/plugin", // Must be last
        ],
    };
};

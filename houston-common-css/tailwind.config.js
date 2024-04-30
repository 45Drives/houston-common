module.exports = {
	content: [
		"*.css",
	],
	theme: {
		extend: {
			fontFamily: {},
			colors: {
				neutral: {
					850: "#222222",
				}
			}
		},
	},
	plugins: [
		require('@tailwindcss/forms'),
	],
	darkMode: 'class',
}

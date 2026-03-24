module.exports = {
	content: [
		"*.css",
	],
	theme: {
		extend: {
			fontFamily: {},
			colors: {
				neutral: {
					750: "#2a2a2a",
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

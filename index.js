const postcss = require('postcss');

module.exports = postcss.plugin('postcss-variables', opts => {
	opts = opts || {};
	let result;

	const isVariableDeclaration = /^\$[\w-]+$/;
	const variablesInString = /(^|[^\\])\$(?:\(([A-z][\w-]*)\)|([A-z][\w-]*))/g;
	const wrappingParen = /^\((.*)\)$/g;

	/**
	 * Split comma separated arguments
	 * 'black, linear-gradient(white, black)' => ['black', 'linear-gradient(white, black)']
	 *
	 * @param {string} string
	 * @param {boolean} [first]
	 * @returns {*}
	 */
	function getArrayedString(string, first) {
		let array = postcss.list
			.comma(String(string))
			.map(substring => {
				return wrappingParen.test(substring) ?
					getArrayedString(substring.replace(wrappingParen, '$1')) :
					substring;
			});

		return first && array.length === 1 ? array[0] : array;
	}

	/**
	 * Retrieve variable, traversing up parent containers as necessary
	 *
	 * @param {postcss.Container} node
	 * @param {string } name
	 * @returns {*}
	 */
	function getVariable(node, name) {
		let value = node.variables && node.variables[name] ?
			node.variables[name] :
		node.parent && getVariable(node.parent, name);

		return value;
	}

	/**
	 * Parse out variables from passed in string
	 * Replace with corresponding values
	 * 'Hello $name' => 'Hello VALUE'
	 *
	 * @param {postcss.Container} node
	 * @param {string} string
	 * @returns {*}
	 */
	function getVariableTransformedString(node, string) {
		return string.replace(variablesInString, (match, before, name1, name2) => {
			let prop = name1 || name2,
				value = getVariable(node, prop);

			if (value === undefined) {
				node.warn(result, 'Undefined variable $' + prop);

				return match;
			}

			return before + formatValue(value);
		});
	}

	/**
	 * Format array of values with comma and space between
	 *
	 * @param {array|string|number} value
	 * @returns {string|*}
	 */
	function formatValue(value) {
		return Array.isArray(value) ? value.join(', ') : value;
	}

	/**
	 * Set variable on node
	 *
	 * @param {postcss.Container} node
	 * @param {string} name
	 * @param {*} value
	 */
	function setVariable(node, name, value) {
		node.variables = node.variables || {};

		node.variables[name] = getArrayedString(value, true);
	}

	/**
	 * Action to be taken on each declaration
	 *
	 * @param {postcss.Declaration} node
	 * @param {postcss.Container} parent
	 * @param {number} nodeCount
	 * @returns {*}
	 */
	function eachDecl(node, parent, nodeCount) {
		// ie - $name: value
		if (isVariableDeclaration.test(node.prop)) {
			node.value = getVariableTransformedString(parent, node.value);

			// Set variable on parent node
			setVariable(parent, node.prop.slice(1), node.value);

			node.remove();

			--nodeCount;
		} else {
			node.prop = getVariableTransformedString(parent, node.prop);
			node.value = getVariableTransformedString(parent, node.value);
		}

		return nodeCount;
	}

	/**
	 * Action to be taken on each rule
	 *
	 * @param {postcss.Container} node
	 * @param {postcss.Container} parent
	 * @param {number} index
	 * @returns {*}
	 */
	function eachRule(node, parent, nodeCount) {
		node.selector = getVariableTransformedString(parent, node.selector);

		return nodeCount;
	}

	/**
	 * Action to be taken on each atRule (ie - @name PARAMS)
	 *
	 * @param {postcss.Container} node
	 * @param {postcss.Container} parent
	 * @param {number} nodeCount
	 * @returns {*}
	 */
	function eachAtRule(node, parent, nodeCount) {
		node.params = getVariableTransformedString(parent, node.params);

		return nodeCount;
	}

	/**
	 * Traverse every node
	 *
	 * @param {postcss.Container} parent
	 */
	function each(parent) {
		let index = -1;
		let node;

		while (node = parent.nodes[++index]) {
			if (node.type === 'decl') {
				index = eachDecl(node, parent, index);
			} else if (node.type === 'rule') {
				index = eachRule(node, parent, index);
			} else if (node.type === 'atrule') {
				index = eachAtRule(node, parent, index);
			}

			if (node.nodes) {
				each(node);
			}
		}
	}

	return (root, res) => {
		result = res;

		// Initialize each global variable
		for (let name in opts.globals || {}) {
			setVariable(root, name, opts.globals[name]);
		}

		// Begin processing each css node
		each(root);
	};
});
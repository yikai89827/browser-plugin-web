module.exports = {
  rules: {
    /** 如果可能, 要求变量声明使用const代替let和var */
    'prefer-const': [
      'error',
      {
        destructuring: 'all',
      },
    ],

    /** 逗号 */
    'comma-style': ['error', 'last'],
    // "beside": ["error", "below"]

    /** 不允许空块语句 */
    'no-empty': [
      'error',
      {
        allowEmptyCatch: true,
      },
    ],

    /** 块前空格 */
    'space-before-blocks': ['error', 'always'],

    /** 禁止或强制圆括号内的空格 */
    'space-in-parens': ['error', 'never'],

    /** 禁止或强制方括号内的空格 */
    'array-bracket-spacing': ['error', 'never'],

    /** 强制在对象字面量的键和值之间使用一致的空格 */
    'key-spacing': [
      'error',
      {
        beforeColon: false,
        afterColon: true,
        mode: 'strict',
      },
    ],

    /** 每行代码的字符数量 */
    'max-len': [
      'error',
      {
        code: 500,
      },
    ],

    /** 禁用未声明的变量 */
    'no-undef': [
      'error',
      {
        typeof: true,
      },
    ],

    /** 强制文件的最大行数 */
    'max-lines': ['error', 800],

    /** 强制函数最大行数 */
    'max-lines-per-function': [
      'error',
      {
        max: 300,
        skipComments: true,
        skipBlankLines: true,
      },
    ],

    /** 要求使用 let 或 const 而不是 var */
    'no-var': ['error'],

    /** 强制函数中的变量在一起声明或分开声明 */
    'one-var': ['error', 'never'],

    /** 禁止连续赋值 */
    'no-multi-assign': ['error'],

    /** 禁止原始包装实例 */
    'no-new-wrappers': ['error'],

    /** 禁止不必要的布尔类型转换 */
    'no-extra-boolean-cast': ['error'],

    /** 建议使用模板字面量而非字符串连接 */
    'prefer-template': 'warn',

    /** 禁止使用 Array 构造函数 */
    'no-array-constructor': ['error'],

    /** 要求成员重载是连续的 */
    '@typescript-eslint/adjacent-overload-signatures': 'error',

    /** 强制数组方法的回调函数中有 return 语句 */
    'array-callback-return': [
      'error',
      {
        allowImplicit: true,
      },
    ],

    /** 禁止使用 Object 构造函数 */
    'no-new-object': ['error'],

    /** 禁用Function构造函数 */
    'no-new-func': ['error'],

    /** 要求使用箭头函数作为回调 */
    'prefer-arrow-callback': 'error',

    /** 建议使用剩余参数代替 arguments */
    'prefer-rest-params': ['warn'],

    /** 要求使用 === 和 !== */
    eqeqeq: ['error'],

    /** 禁止可以表达为更简单结构的三元操作符 */
    'no-unneeded-ternary': ['warn'],

    /** 优先使用数组和对象解构 */
    'prefer-destructuring': [
      'warn',
      {
        array: true,
        object: true,
      },
      {
        enforceForRenamedProperties: false,
      },
    ],

    /** 限制函数定义中最大参数个数 */
    'max-params': ['error', 5],

    /** 限制圈复杂度 例: switch case最大20个case */
    complexity: ['error', 20],

    /** 验证构造函数中 super() 的调用  */
    'constructor-super': ['error'],

    /** 在构造函数中禁止在调用super()之前使用this或super */
    'no-this-before-super': ['error'],

    /** 禁止混合使用不同的操作符 */
    'no-mixed-operators': [
      'warn',
      {
        groups: [
          ['+', '-', '*', '/', '%', '**'],
          ['&', '|', '^', '~', '<<', '>>', '>>>'],
          ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
          ['&&', '||'],
          ['in', 'instanceof'],
        ],
        allowSamePrecedence: true,
      },
    ],

    /** 禁止 case 语句落空 */
    'no-fallthrough': [
      'error',
      {
        commentPattern: 'break[\\s\\w]*omitted',
      },
    ],

    /** 要求 Switch 语句中有 Default 分支 使用 // no default 来表明此处不需要 default 分支。注释可以任何形式出现，比如 // No Default */
    'default-case': ['error'],

    /** 强制块语句的最大可嵌套深度 */
    'max-depth': ['error', 4],

    /** 禁止在 else 前有 return  如果 if 块中包含了一个 return 语句，else 块就成了多余的了。可以将其内容移至块外 */
    'no-else-return': [
      'warn',
      {
        allowElseIf: true,
      },
    ],

    /** 禁用 eval() */
    'no-eval': [
      'error',
      {
        allowIndirect: false,
      },
    ],

    /** 禁用 Alert */
    'no-alert': ['error'],

    /** 禁用警告注释 */
    'no-warning-comments': [
      'warn',
      {
        terms: ['todo', 'fixme', 'any other term'],
        location: 'anywhere',
      },
    ],

    /** 要求构造函数首字母大写 */
    'new-cap': [
      'error',
      {
        newIsCap: true,
      },
    ],

    /** 禁止出现多个空格 */
    'no-multi-spaces': [
      'warn',
      {
        exceptions: {
          VariableDeclarator: true,
          ImportDeclaration: true,
        },
        ignoreEOLComments: true,
      },
    ],

    /** 数组类型定义 简单类型（即只是原始名称或类型引用的类型）用T[]/readonly T[] 其他情况用Array<T>/ReadonlyArray<T> */
    '@typescript-eslint/array-type': [
      'error',
      {
        default: 'array-simple',
      },
    ],

    /** 不允许等待不是 Thenable 的值 */
    '@typescript-eslint/await-thenable': 'error',

    /** 命名 */
    '@typescript-eslint/naming-convention': [
      'warn',
      {
        selector: 'default',
        format: ['camelCase', 'PascalCase', 'snake_case', 'UPPER_CASE',],
      },
      {
        selector: 'variable',
        format: ['camelCase', 'PascalCase'],
      },
      {
        selector: 'function',
        format: ['camelCase', 'PascalCase', 'snake_case', 'UPPER_CASE'],
      },
      {
        selector: 'classMethod',
        format: ['camelCase', 'PascalCase', 'snake_case', 'UPPER_CASE'],
      },
      {
        selector: 'variableLike',
        format: ['camelCase'],
      },
    ],

    /** 禁止声明空接口 */
    '@typescript-eslint/no-empty-interface': [
      'error',
      {
        allowSingleExtends: false,
      },
    ],

    /** 禁止额外的非空断言 */
    '@typescript-eslint/no-extra-non-null-assertion': 'error',

    /** 不允许对初始化为数字、字符串或布尔值的变量或参数进行显式类型声明 */
    '@typescript-eslint/no-inferrable-types': 'error',

    /** 不允许在空值合并运算符的左操作数中使用非空断言 */
    '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',

    /** 不允许在可选链表达式之后使用非空断言 */
    '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',

    /** !不允许使用后缀运算符的非空断言 */
    '@typescript-eslint/no-non-null-assertion': 'warn',

    /** 标记与布尔文字不必要的相等比较 */
    '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',

    /** 防止类型始终为真或始终为假的条件 */
    '@typescript-eslint/no-unnecessary-condition': 'error',

    /** 如果类型断言不改变表达式的类型，则发出警告 */
    '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

    /** 禁止对泛型类型进行不必要的约束 */
    '@typescript-eslint/no-unnecessary-type-constraint': 'error',

    /** 不允许调用任何类型的值 */
    // "@typescript-eslint/no-unsafe-call": "error",

    /** 不允许成员访问任何类型的变量 */
    // "@typescript-eslint/no-unsafe-member-access": "error",

    /** 要求或禁止在类构造函数中使用参数属性 */
    '@typescript-eslint/parameter-properties': 'error',

    /** 更喜欢使用as const文字类型 */
    '@typescript-eslint/prefer-as-const': 'error',

    /** 如果索引仅用于访问被迭代的数组，则首选“for-of”循环而不是标准“for”循环 */
    // '@typescript-eslint/prefer-for-of': 'error',

    /** 要求使用namespace关键字而不是module关键字来声明自定义 TypeScript 模块 */
    '@typescript-eslint/prefer-namespace-keyword': 'error',

    /** 强制使用无效合并运算符而不是逻辑链接 */
    '@typescript-eslint/prefer-nullish-coalescing': [
      'warn',
      {
        ignoreConditionalTests: true,
        ignoreMixedLogicalExpressions: true,
      },
    ],

    /** 更喜欢使用简洁的可选链表达式而不是链式逻辑与 */
    '@typescript-eslint/prefer-optional-chain': 'warn',

    /** 强制模板文字表达式为字符串类型 */
    '@typescript-eslint/restrict-template-expressions': [
      'warn',
      {
        allowNumber: true,
        allowBoolean: false,
        allowAny: true,
        allowNullish: false,
        allowRegExp: false,
      },
    ],

    /** 使用联合类型时, switch 缺少case的情况 */
    '@typescript-eslint/switch-exhaustiveness-check': 'warn',

    /** 块必须使用大括号 */
    'brace-style': 'error',
    '@typescript-eslint/brace-style': [
      'error',
      '1tbs',
      {
        allowSingleLine: false,
      },
    ],

    /** 要求或不允许尾随逗号 */
    'comma-dangle': [2, 'always-multiline'],
    '@typescript-eslint/comma-dangle': 'error',

    /** 强制将默认参数放在最后 */
    'default-param-last': 'error',
    '@typescript-eslint/default-param-last': 'error',

    /** 要求或不允许函数标识符及其调用之间有间距 */
    'func-call-spacing': 'error',
    '@typescript-eslint/func-call-spacing': ['error', 'never'],

    /** 缩进 */
    indent: 'off',
    // "@typescript-eslint/indent": ["error", "tab", {
    //   ignoredNodes: ["ConditionalExpression"],
    //   ignoreComments: true
    // }],
    '@typescript-eslint/indent': 'error',

    /** 禁止变量声明覆盖外层作用域的变量 */
    'no-shadow': 'error',
    '@typescript-eslint/no-shadow': ['error'],

    /** 在变量声明中要求或禁止初始化 */
    'init-declarations': 'error',
    '@typescript-eslint/init-declarations': 'error',

    /** 在关键字前后强制保持一致的间距 */
    'keyword-spacing': 'error',
    '@typescript-eslint/keyword-spacing': [
      'error',
      {
        before: true,
        after: true,
      },
    ],

    /** 要求或禁止类方法之间有空行 */
    'lines-between-class-members': 'error',
    '@typescript-eslint/lines-between-class-members': [
      'error',
      {
        exceptAfterOverload: true,
      },
    ],

    /** 不允许类成员中有重复的名称 */
    'no-dupe-class-members': 'error',
    '@typescript-eslint/no-dupe-class-members': ['error'],

    /** 禁止重复导入 */
    'no-duplicate-imports': 'error',
    '@typescript-eslint/no-duplicate-imports': [
      'error',
      {
        includeExports: true,
      },
    ],

    /** 禁止空函数 */
    'no-empty-function': 'error',
    '@typescript-eslint/no-empty-function': ['error'],

    /** 禁止不必要的分号 */
    'no-extra-semi': 'error',
    '@typescript-eslint/no-extra-semi': ['error'],

    /** 禁止使用eval()-like 方法 */
    'no-implied-eval': 'error',
    '@typescript-eslint/no-implied-eval': ['error'],

    /** 禁止失去精度的文字数字 */
    'no-loss-of-precision': 'error',
    '@typescript-eslint/no-loss-of-precision': ['error'],

    /**	禁止未使用的变量 */
    'no-unused-vars': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'none',
        ignoreRestSiblings: false,
      },
    ],

    /** 在定义之前禁止使用变量 */
    'no-use-before-define': 'error',
    '@typescript-eslint/no-use-before-define': ['error'],

    /** 在函数括号之前强制保持一致的间距 */
    'object-curly-spacing': 'error',
    '@typescript-eslint/object-curly-spacing': ['error', 'always'],

    /** 确保运算符周围有空格。 */
    'space-infix-ops': 'error',
    '@typescript-eslint/space-infix-ops': [
      'error',
      {
        int32Hint: false,
      },
    ],
    /*禁止动态构造正则表达式（防ReDos攻击）*/
    "security/detect-non-literal-regexp": "error"
  },
  globals: {
    BASE_API: 'readonly',
    __POWERED_BY_QIANKUN__: 'readonly',
  },
};
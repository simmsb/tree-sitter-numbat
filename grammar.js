const PREC = {
  string: 23,
  hex_number: 22,
  oct_number: 21,
  bin_number: 20,
  number: 19,
  identifier: 18,

  dim_primary: 17,  
  dim_exponent: 16,
  dim_power: 15,
  dim_factor: 14,

  postfix_apply: 13,
  condition: 12,
  conversion: 11,
  comparison: 10,
  term: 9,
  factor: 8,
  per_factor: 7,
  negate: 6,
  ifactor: 5,
  power: 4,
  factorial: 3,
  unicode_power: 2,
  call: 1,
  primary: 0,
};

function *intersperse(a, delim) {
  let first = true;
  for (const x of a) {
    if (!first) yield delim;
    first = false;
    yield x;
  }
}

function nlseq(...rules) {
  return seq(...intersperse(rules, optional(/\r?\n/)));
}

function nlseq1(...rules) {
  return seq(optional(/\r?\n/), ...intersperse(rules, optional(/\r?\n/)));
}


module.exports = grammar({
  name: 'numbat',

  extras: $ => [token(" "), $.line_comment],

  reserved: {
    global: _ => [
      'let', 'struct', 'where', 'and'
    ],
  },

  conflicts: $ => [[$.function_decl], [$.struct_decl]],

  externals: $ => [
    $._string_content,
    $._float,
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => seq(
      optional(seq($.shebang, /\n/)),
      repeat(seq(optional($._statement), /\r?\n/)),
    ),

    shebang: _ => /#!.*/,

    //! statement       →   variable_decl | function_decl | dimension_decl | decorator | unit_decl | module_import | procedure_call | expression
    _statement: $ => choice(
      $.variable_decl,
      $.function_decl,
      $.dimension_decl,
      $.struct_decl,
      $.decorator,
      $.unit_decl,
      $.module_import,
      $.procedure_call,
      $._expression
    ),
    
    //! variable_decl   →   "let" identifier ( ":" type_annotation ) ? "=" expression
    variable_decl: $ => seq(
      "let",
      field("name", $.identifier),
      field("type_parameter", optional(seq(":", $.type_annotation))),
      "=",
      field("value", $._expression)
    ),

    // ============ FUNCTION DECLARATION

    //! function_decl   →   "fn" identifier ( fn_decl_generic ) ? fn_decl_param "->" type_annotation "=" expression
    function_decl: $ => seq(
      "fn",
      field("name", $.identifier),
      optional(field("type_parameter", $._fn_decl_generic)),
      $._fn_decl_param,
      optional(seq(
        "->",
        $.type_annotation,
      )),
      optional(seq(
        "=",
        optional($._newline),
        field("body", $._expression)
      )),
      optional(seq(
        optional($._newline),
        "where",
        field("where", seq(
          field("name", $.identifier),
          field("type_parameter", optional(seq(":", $.type_annotation))),
          "=",
          field("value", $._expression),
          optional(field("ands", repeat(
            seq(
              optional($._newline),
              "and",
              field("name", $.identifier),
              field("type_parameter", optional(seq(":", $.type_annotation))),
              "=",
              field("value", $._expression)
            )
          )
          ))
        ))
      ))
    ),

    _newline: _ => /\r?\n/,

    //! fn_decl_generic →   "<" ( identifier "," ) * identifier ? ">"
    _fn_decl_generic: $ => seq(
      "<",
      repeat(seq($.identifier, ",")),
      optional($.identifier),
      ">",
    ),

    //! fn_decl_param   →   "(" ( identifier ( ":" dimension_expr ) ? "," )* ( identifier ( ":" dimension_expr ) ) ? ")"
    _fn_decl_param: $ => seq(
      "(",
      repeat(nlseq1(
        $.identifier,
        optional(nlseq(":", $.dimension_expr)),
        ",",
      )),
      optional(nlseq1(
        $.identifier,
        optional(nlseq(":", $.dimension_expr)),
      )),
      ")",
    ),

    // ============ DIMENSION DECLARATION
    //! dimension_decl  →   "dimension" identifier ( "=" dimension_expr ) *
    dimension_decl: $ => seq(
      "dimension",
      field("name", $.identifier),
      repeat(seq(
        "=",
        $.dimension_expr
      ))
    ),

    struct_decl: $ => nlseq(
      "struct", 
      field("name", $.identifier),
      "{",
      field("fields",
        optional(
          nlseq(
            $.identifier, ":", $.dimension_expr,
            repeat(nlseq(
              ",", $.identifier, ":", $.dimension_expr
            ))
          )
        )
      ),
      "}"
    ),


    // ============ DECORATOR
    //! decorator       →   "@" ( "metric_prefixes" | "binary_prefixes" | ( "aliases(" list_of_alsiases ")" ) )
    decorator: $ => seq(
      "@",
      choice(
        "metric_prefixes",
        "binary_prefixes",
        seq("aliases", $._list_of_aliases)
      ),
    ),

    //! list_of_aliases →   "@" ( "metric_prefixes" | "binary_prefixes" | ( "aliases(" list_of_alsiases ")" ) )
    _list_of_aliases: $ => seq(
      "(",
      repeat(seq(
        $.identifier,
        optional(seq(":", choice("long", "short", "both", "none"))),
        ","
      )),
      seq(
        $.identifier,
        optional(seq(":", choice("long", "short", "both", "none"))),
      ),
      ")"
    ),

    
    // ============ UNIT DECLARATION
    //! unit_decl       →   "unit" ( ":" dimension_expr ) ? ( "=" expression ) ?
    unit_decl: $ => seq(
      "unit",
      optional(seq(
        ":", $.dimension_expr
      )),
      optional(seq(
        "=", $._expression
      ))
    ),

    //! module_import   →   "use" ident ( "::" ident) *
    module_import: $ => seq(
      "use",
      $.identifier,
      repeat(seq(
        "::", $.identifier
      )),
    ),

    //! procedure_call   →   ( "print" | "assert_eq" | "type" ) "(" arguments ")"
    procedure_call: $ => seq(
      choice("print", "assert_eq", "type"),
      "(",
      $.arguments,
      ")",
    ),

    //! type_annotation →   boolean | string | dimension_expr
    type_annotation: $ => choice(
      $.boolean,
      $.string,
      $.dimension_expr
    ),

    //! dimension_expr  →   dim_factor
    dimension_expr: $ => choice(
      $._dim_factor,
      $._dim_power,
      $._dim_exponent,
      $._dim_primary
    ),

    //! dim_factor      →   dim_power ( (multiply | divide) dim_power ) *
    _dim_factor: $ => prec.left(PREC.dim_factor, seq(
      $.dimension_expr,
      choice($.multiply, $.divide),
      $.dimension_expr,
    )),

    //! dim_power       →   dim_primary ( power dim_exponent | unicode_exponent ) ?
    _dim_power: $ => prec(PREC.dim_power, seq(
      $.dimension_expr,
      choice(
        seq($.power, $._dim_exponent),
        $.unicode_exponent,
      ),
    )),

    //! dim_exponent    →   number | minus dim_exponent | "(" dim_exponent ( divide dim_exponent ) ? ")"
    _dim_exponent: $ => prec(PREC.dim_exponent, choice(
      $.number,
      seq($.minus, $._dim_exponent),
      seq("(", $._dim_exponent, optional(seq($.divide, $._dim_exponent)), ")"),
    )),

    //! dim_primary     →   identifier | number | ( "(" dimension_expr ")"
    _dim_primary: $ => prec(PREC.dim_primary, choice(
      $.identifier,
      $.number,
      seq("(", $.dimension_expr, ")"),
    )),

    // ============ EXPRESSION
    
    //! expression      →   postfix_apply
    _expression: $ => choice(
      $.postfix_apply,
      $.condition,
      $.conversion,
      $.comparison,
      $.term,
      $.factor,
      $.per_factor,
      $.negate,
      $.ifactor,
      $.power,
      $.factorial,
      $.unicode_power,
      $.call,
      $.list_expression,
      $.struct_expression,
      $._parenthesized_expression,
      $._primary,
    ),

    list_expression: $ => seq(
      "[",
      optional(seq($._expression, repeat(seq(",", $._expression)))),
      "]"
                ),

    struct_expression: $ => nlseq(
      seq($.identifier, "{"),
      optional(nlseq(
        $.identifier, ":", $._expression,
        repeat(
          nlseq(
            ",", $.identifier, ":", $._expression,
          )
        )
      )),
      "}"
    ),

    //! postfix_apply   →   condition ( "//" identifier ) *
    postfix_apply: $ => prec.right(PREC.postfix_apply, seq(
      $._expression,
      "//",
      $.identifier
    )),

    //! condition       →   "if" conversion "then" condition "else" condition | conversion
    condition: $ => prec.left(PREC.condition, seq(
      "if",
      field("if", $._expression),
      "then",
      field("then", $._expression),
      "else",
      field("else", $._expression)
    )),

    //! conversion      →   comparison ( ( "→" | "->" | "to" ) comparison ) *
    conversion: $ => prec.left(PREC.conversion, seq(
      field("left", $._expression),
      field("op", choice("→", "->", "to")),
      field("right", $._expression)
    )),

    //! comparison      →   term ( (">" | ">="| "≥" | "<" | "<=" | "≤" | "==" | "!=" | "≠" ) term ) *
    comparison: $ => prec.left(PREC.comparison, seq(
      field("left", $._expression),
      field("op", choice(">", ">=", "≥", "<=", "≤", "<", "==", "!=", "≠")),
      field("right", $._expression),
    )),

    //! term            →   factor ( ( "+" | "-") factor ) *
    term: $ => prec.left(PREC.term, seq(
      field("left", $._expression),
      field("op", choice($.plus, $.minus)),
      field("right", $._expression),
    )),

    //! factor          →   negate ( ( "*" | "/") per_factor ) *
    factor: $ => prec.left(PREC.factor, seq(
      field("left", $._expression),
      field("op", choice($.multiply, $.divide)),
      field("right", $._expression),
    )),

    //! per_factor      →   negate ( "per" negate ) *
    per_factor: $ => prec.left(PREC.per_factor, seq(
      field("left", $._expression),
      field("op", "per"),
      field("right", $._expression),
    )),

    //! negate          →   ( "-" negate ) | ifactor
    negate: $ => prec(PREC.negate, seq("-", $._expression)),

    //! ifactor         →   power ( " " power ) *
    ifactor: $ => prec.left(PREC.ifactor, seq(
      field("left", $._expression),
      // space are automatically ignored
      field("right", $._primary),
    )),

    //! power           →   factorial ( "^" "-" ? power ) ?
    power: $ => prec.left(PREC.power, seq(
      field("left", $._expression),
      $.pow_symbol,
      field("power", seq(
        optional($.minus),
        $._expression
      ))
    )),

    //! factorial       →   unicode_power "!" *
    factorial: $ => prec(PREC.factorial, seq($._expression, "!")),
    
    //! unicode_power   →   call ( "⁻" ? ("¹" | "²" | "³" | "⁴" | "⁵" ) ) ?
    unicode_power: $ => prec(PREC.unicode_power, seq(
      field("left", $._expression),
      optional("⁻"),
      choice("¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹")
    )),

    //! call            →   primary ( "(" arguments? ")" ) ?
    call: $ => prec(PREC.call, seq(
      field("name", $.identifier),
      "(",
      optional($._newline),
      optional($.arguments),
      ")"
    )),

    //! arguments       →   expression ( "," expression ) *
    arguments: $ => seq(
      $._expression,
      optional(repeat(nlseq1(
        ",",
        $._expression
      )))
    ),

    _parenthesized_expression: $ => seq(
      '(',
      $._expression,
      ')',
    ),

    //! primary         →   string | boolean | hex_number | oct_number | bin_number | number | identifier | "(" expression ")"
    _primary: $ => prec(PREC.primary, choice(
      $.string,
      $.boolean,
      $.number,
      $.identifier,
    )),

    //! string          →   /"[^"]*"/
    string: $ => prec(PREC.string, seq(
      alias(/b?"/, '"'),
      repeat(choice(
        $.escape_sequence,
        $._string_content,
      )),
      token.immediate('"'),
    )),

    escape_sequence: _ => token.immediate(
      seq('\\',
        choice(
          /[^xu]/,
          /u[0-9a-fA-F]{4}/,
          /u\{[0-9a-fA-F]+\}/,
          /x[0-9a-fA-F]{2}/,
        ),
      )),

    //! boolean         →   true | false
    boolean: $ => choice(
      "true",
      "false"
    ),

    number: $ => prec(PREC.number, choice(
      $._float,
      token(choice(
          /[0-9][0-9_]*/,
          /0x[0-9a-fA-F_]+/,
          /0b[01_]+/,
          /0o[0-7_]+/,
        )),
    )),

    //! identifier      →   [a-zA-Z_][a-zA-Z_0-9]*
    identifier: $ => /[a-zA-Z_][a-zA-Z_0-9]*/,

    //! plus            →   "+"
    plus: $ => "+",

    //! minus           →   "-"
    minus: $ => "-",

    //! multiply        →   "*" | "·" | "×"
    multiply: $ => choice("*", "·", "×"),

    //! divide          →   "/" | "÷"
    divide: $ => choice("/", "÷"),

    //! pow_symbol      →   "**" | "^"
    pow_symbol: $ => choice("**", "^"),
    
    //! unicode_exponent→    "¹" | "²" | "³" | "⁴" | "⁵" | "⁶" | "⁷" | "⁸" | "⁹" 
    unicode_exponent: $ => choice( "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"),
   
    line_comment: _ => token(seq(
      '#', /.*/,
    )),

  }
});

/*
   For Completing this assignment, I have used following references
   StakOverflow, CSC-519 Course Links
*/

var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var calculate = require('cartesian-product');
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');


function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		// To test here you can change the file name to subject.js/mystery.js
		args = ["subject.js"];
	}
	var filePath = args[0];
	//To extract first part of file name to make it more generic
    file = args[0].substring(0, args[0].indexOf("."));
	constraints(filePath);

	generateTestCases()

}

var engine = Random.engines.mt19937().autoSeed();

function createConcreteIntegerValue( greaterThan, constraintValue )
{
	if( greaterThan )
		return Random.integer(constraintValue,constraintValue+10)(engine);
	else
		return Random.integer(constraintValue-10,constraintValue)(engine);
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	// Supported kinds: "fileWithContent","fileExists"
	// integer, string, phoneNumber
	this.kind = properties.kind;
}
var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
  			//Second condition to check the path for (buf.length>0)
  			file2: '', 
		}
	}
};


function generateTestCases()
{

	var content = "var "+file+" = require('./"+file+".js')\nvar mock = require('mock-fs');\n";
	for ( var funcName in functionConstraints )
	{
		
		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {kind: 'fileWithContent' });
		var pathExists      = _.some(constraints, {kind: 'fileExists' });
		var params = {};
		var numberList = [[0,1,2,3,4,5,6,7,8,9], [0,1,2,3,4,5,6,7,8,9], [0,1,2,3,4,5,6,7,8,9]]

		var flag = false
		var bool = false
		// initialize params
		for(var i =0; i < functionConstraints[funcName].params.length; i++)
		{
			var paramName = functionConstraints[funcName].params[i];
			
			params[paramName] = ['\'\'']
			if (paramName == "phoneNumber")
			{
				flag = true
			}
			if( paramName == "options") 
			{
				bool = true
			}
			
		}

         // plug-in values for parameters
		for( var c = 0; c < constraints.length; c++ )
		{
			
			var constraint = constraints[c];
		

            if( params.hasOwnProperty( constraint.ident ) )
            {
                if (constraint.ident == "dir")
                {
                    if( constraint.kind == "fileExists")
                    {
                        params[constraint.ident].push(constraint.value);
                    }
                }
                else if (constraint.ident == "filePath")
                {
                    if( constraint.kind == "fileWithContent")
                    {
                        params[constraint.ident].push(constraint.value);
                    }
                }
                else {

                    params[constraint.ident].push(constraint.value);
                }
            }
			
		}
		// Prepare function arguments.
		var args = Object.keys(params).map( function(x) { return params[x] } );
		
		//here we are passing the list of lists to create possible combinations
		result = calculate(args);
		
		for (var i=0; i< result.length; i++) {
			content += ""+file+".{0}({1});\n".format(funcName, result[i] );
		
			if( pathExists || fileWithContent )
			{
				
				var argument = result[i].join(',')
				if (argument != "'',''")
				{
					content += generateMockFsTestCases(pathExists,fileWithContent,funcName, argument);
					content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, argument);
					content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, argument);
					content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, argument);
				}
			}
	
		}
	    //Here we are checking if the flag is true or not and accordingly performing the operations
		if(flag)
		{ 
			num = calculate(numberList)
			for (var i=0; i< num.length; i++) {
				var phoneNumber= "'" + num[i].toString().split(',').join('') + "0000000'";
				params["phoneNumber"] = phoneNumber				

				if(bool)
				{
					params["options"] = "'ispresent'"
				}
				
				var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
				// Emit simple test case.
				content += ""+file+".{0}({1});\n".format(funcName, args );
			}

		}

	}

	fs.writeFileSync('test.js', content, "utf8");

}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\t"+file+".{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};
			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						 // get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand,
							funcName: funcName,
							kind: "string",	
							operator : child.operator,
							expression: expression	
						}));

						var newValue = "'"+rightHand+"rand'";
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: newValue,
							funcName: funcName,
							kind: "string",	
							operator : child.operator,
							expression: expression
						}));
						
					}
				
				if ( child.left.type == 'CallExpression' && params.indexOf( child.left.callee.object.name ) > -1 ) 
				{

					 var expression = buf.substring(child.range[0], child.range[1]);
                     var newValue = ''
                        for (var i=0 ; i<=child.right.value; i++)
                        {
                            if (i == child.right.value)
                            {
                                newValue += child.left.arguments[0].value
                            }

                            else
                            {
                                  newValue += "r";
                            }
                        }
                        
                        functionConstraints[funcName].constraints.push( 
                            new Constraint(
                            {
                                ident: child.left.callee.object.name,
                                value: "'"+ newValue + "'",
                                funcName: funcName

                            }));    

				}

				}

				if( child.type === 'BinaryExpression' && child.operator == "!=")
				{
					if( child.left.type == 'Identifier' && params.indexOf(child.left.name) > -1 )
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand,
							funcName: funcName,
							kind: "string",	
							operator : child.operator,
							expression: expression
						}));
						
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: "'"+rightHand+"rand'",
							funcName: funcName,
							kind: "string",	
							operator : child.operator,
							expression: expression
						}));

						
					}

				}

             if( child.type === 'BinaryExpression' && child.operator == "<")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1) 
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand+1,
							funcName: funcName,
							kind: "integer",
							operator : child.operator,
							expression: expression
							
						}));
						
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand-1,
							funcName: funcName,
							kind: "integer",
							operator : child.operator,
							expression: expression
						}));
					}

				}
				if( child.type === 'BinaryExpression' && child.operator == ">")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1) 
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						
						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand,
							funcName: funcName,
							kind: "integer",
							operator : child.operator,
							expression: expression
						}));

						functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand+1,
							funcName: funcName,
							kind: "integer",
							operator : child.operator,
							expression: expression
						}));
						
					}

				}


				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{

							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));

							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file2'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}
            if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: params[p],
								// A fake path to a file
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileExists",
								operator : child.operator,
								expression: expression
							}));
						}
					}
				}
			});

			console.log( functionConstraints[funcName]);
		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();
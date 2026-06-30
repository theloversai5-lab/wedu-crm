import re

with open('frontend/src/pages/Pipeline.jsx', 'r') as f:
    content = f.read()

# Replace getStageColor logic
content = re.sub(r'const getStageColor = \(stage\) => \{.*?return colors\[stage\] \|\| \'bg-gray-50 border-gray-200\';\n\};', 
"""const getStageColor = (stage) => {
    const colors = {
        'Meeting Done': 'bg-green-50 border-green-300',
        'Highly Interested': 'bg-emerald-50 border-emerald-300',
        'Interested': 'bg-blue-50 border-blue-300',
        'MND': 'bg-purple-50 border-purple-300',
        'Call Back': 'bg-orange-50 border-orange-300',
        'Busy': 'bg-yellow-50 border-yellow-300',
        'No Response': 'bg-gray-100 border-gray-300',
        'Foreign': 'bg-teal-50 border-teal-300',
        'Future Projection': 'bg-indigo-50 border-indigo-300',
        'Needs Review': 'bg-rose-50 border-rose-300',
        'Not Interested': 'bg-red-50 border-red-300'
    };
    return colors[stage] || 'bg-gray-50 border-gray-200';
};""", content, flags=re.DOTALL)

# Replace getHeaderColor logic
content = re.sub(r'const getHeaderColor = \(stage\) => \{.*?return colors\[stage\] \|\| \'bg-gray-200\';\n\};', 
"""const getHeaderColor = (stage) => {
    const colors = {
        'Meeting Done': 'bg-green-200',
        'Highly Interested': 'bg-emerald-200',
        'Interested': 'bg-blue-200',
        'MND': 'bg-purple-200',
        'Call Back': 'bg-orange-200',
        'Busy': 'bg-yellow-200',
        'No Response': 'bg-gray-200',
        'Foreign': 'bg-teal-200',
        'Future Projection': 'bg-indigo-200',
        'Needs Review': 'bg-rose-200',
        'Not Interested': 'bg-red-200'
    };
    return colors[stage] || 'bg-gray-200';
};""", content, flags=re.DOTALL)

with open('frontend/src/pages/Pipeline.jsx', 'w') as f:
    f.write(content)

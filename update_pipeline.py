import re

with open('frontend/src/pages/Pipeline.jsx', 'r') as f:
    content = f.read()

# Replace TRACK definitions with categories
new_tracks = """const CATEGORIES = [
    'Meeting Done', 'Highly Interested', 'Interested', 'MND',
    'Call Back', 'Busy', 'No Response',
    'Foreign', 'Future Projection', 'Needs Review', 'Not Interested'
];
const ALL_STAGES = CATEGORIES;"""

content = re.sub(r'// Track 1: Lead Workflow\n.*?const ALL_STAGES = \[...TRACK_1_STAGES, ...TRACK_2_STAGES\];', new_tracks, content, flags=re.DOTALL)

# Replace pipelineStage with category
content = content.replace('pipelineStage', 'category')
content = content.replace('Pipeline Stage', 'Category')
content = content.replace('pipeline stage', 'category')

with open('frontend/src/pages/Pipeline.jsx', 'w') as f:
    f.write(content)

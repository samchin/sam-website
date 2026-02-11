# Installation

## Step 1: Clone the repository

```bash
# Clone the repository
git clone git@github.com:samchin/haptic-hearing-website.git

# Navigate into the project directory
cd haptic-hearing-website
```

## Step 2: Create mamba environment

```bash
# Create mamba environment from environment.yml
# This will create an environment named 'haptichearing' in your default mamba envs location
mamba env create -f environment.yml -n haptichearing

# Activate the environment
mamba activate haptichearing
```

**Note:** If the above fails due to the hardcoded prefix in environment.yml, you can create the environment manually:

```bash
# Alternative: Create environment and install dependencies manually
mamba create -n haptichearing python=3.13.1 -y
mamba activate haptichearing
mamba install --file <(grep -v "^prefix:" environment.yml | grep -v "^name:" | grep "^  -" | sed 's/^  - //') -c conda-forge -c anaconda -y
pip install audioop-lts==0.2.1 sounddevice==0.5.1
```

## Step 3: Install npm dependencies

```bash
# Make sure you're in the project directory
npm install
```

## Step 4: Run the application

You'll need **two terminals**:

### Terminal 1 (Backend Server):
```bash
mamba activate haptichearing
python server.py
```

### Terminal 2 (Frontend):
```bash
npm run start
```

The app will be available at [http://localhost:3000](http://localhost:3000)

---

## Quick Copy-Paste (All-in-One)

```bash
# Clone
git clone git@github.com:samchin/haptic-hearing-website.git
cd haptic-hearing-website

# Create mamba environment
mamba env create -f environment.yml -n haptichearing
mamba activate haptichearing

# Install npm dependencies
npm install

# Then run in two terminals:
# Terminal 1: mamba activate haptichearing && python server.py
# Terminal 2: npm run start
```

# Installation

## Step 1: Clone the repository

```bash
# Clone the repository
git clone git@github.com:samchin/haptic-hearing-website.git

# Navigate into the project directory
cd haptic-hearing-website
```

## Step 2: Create conda environment

```bash
# Create conda environment from environment.yml
# This will create an environment named 'haptichearing' in your default conda envs location
conda env create -f environment.yml -n haptichearing

# Activate the environment
conda activate haptichearing
```

**Note:** If the above fails due to the hardcoded prefix in environment.yml, you can create the environment manually:

```bash
# Alternative: Create environment and install dependencies manually
conda create -n haptichearing python=3.13.1 -y
conda activate haptichearing
conda install --file <(grep -v "^prefix:" environment.yml | grep -v "^name:" | grep "^  -" | sed 's/^  - //') -c conda-forge -c anaconda -y
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
conda activate haptichearing
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

# Create conda environment
conda env create -f environment.yml -n haptichearing
conda activate haptichearing

# Install npm dependencies
npm install

# Then run in two terminals:
# Terminal 1: conda activate haptichearing && python server.py
# Terminal 2: npm run start
```

# How to run

1) cmd shift p select interperter haptichearing
2) cd sam-website
In terminal 1
3) conda activate /Users/emmiefitz-gibbon/anaconda3/envs/haptichearing
4) python server.py
In apple terminal
5) MAKE SURE directory is sam-website, (base) works
6) npm run start


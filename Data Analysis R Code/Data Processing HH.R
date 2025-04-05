# Load required packages
requiredPackages <- c("readr", "tidyverse", "lme4", "dplyr", "caret", "ggplot2", "purrr", "stringr", "reshape2")
for(p in requiredPackages) {
  if(!require(p, character.only = TRUE)) install.packages(p)
  library(p, character.only = TRUE)
}

# Set global theme for plots
my_theme <- theme_minimal() +
  theme(
    plot.title = element_text(size = 14, hjust = 0.5),
    axis.title.x = element_text(size = 12),
    axis.title.y = element_text(size = 12),
    legend.title = element_text(size = 12),
    legend.text = element_text(size = 10),
    legend.position = 'top',
    legend.justification = 'center',
    legend.direction = 'horizontal',
    axis.text = element_text(size = 10, color = "grey30")
  )

## Data Loading and Processing
# Base directory where all participant data is stored
base_dir = "../Data/Psychophysical Data/"
# If none of the predefined paths work, ask user to specify the directory
if (!dir.exists(base_dir)) {
  cat("Cannot find the data directory. Please modify the script to set 'base_dir' to the correct path.\n")
}

# Get all participant folders - these are the numeric folders (e.g., "576", "272", "658")
participant_folders <- list.dirs(path = base_dir, full.names = TRUE, recursive = FALSE)

# Filter to only include directories that are named with numbers (participant IDs)
participant_folders <- participant_folders[grepl("^[0-9]+$", basename(participant_folders))]
participant_ids <- basename(participant_folders)
cat("Found", length(participant_folders), "participant folders:", paste(participant_ids, collapse=", "), "\n") 

## Functions
# Header row transform 
# Function to find the header row and properly format data
find_header_and_transform <- function(file_path) {
  df <- read.csv(file_path, header = FALSE, fill = TRUE, stringsAsFactors = FALSE)
  
  # Look for the row that contains "Timestamp" in the first column (or another known header)
  header_row <- which(df[,1] == "Timestamp")
  
  if (length(header_row) == 0) {
    cat("No valid header found in", file_path, "\n")
    return(NULL)  # Skip file
  }
  
  # Use this row as column names
  colnames(df) <- as.character(df[header_row,])
  
  # Remove rows above the detected header
  df <- df[(header_row + 1):nrow(df),]
  
  # Reset row numbers
  rownames(df) <- NULL
  
  return(df)
} 

## Load in data
# Function to extract metadata from filename
extract_metadata <- function(filename) {
  # Extract the basename of the file
  basename_file <- basename(filename)
  
  # Pattern for files like: two_point_discrimination_overear_pid947_2025-03-23T04-05-13-148Z.csv
  if (grepl("_overear_|_bracelet_|_necklace_", basename_file)) {
    parts <- unlist(strsplit(basename_file, "_"))
    
    # Find device type
    device_index <- which(parts %in% c("overear", "bracelet", "necklace"))
    if (length(device_index) > 0) {
      device_type <- parts[device_index]
      
      # Find test type
      if (grepl("two_point|twopoint", basename_file, ignore.case=TRUE)) {
        test_type <- "two_point_discrimination"
      } else if (grepl("localization", basename_file, ignore.case=TRUE)) {
        test_type <- "localization_accuracy"
      } else if (grepl("absolute", basename_file, ignore.case=TRUE)) {
        test_type <- "absolute_threshold"
      } else {
        test_type <- paste(parts[1:(device_index-1)], collapse="_")
      }
      
      # Find PID
      pid_part <- grep("pid", parts, value=TRUE)
      if (length(pid_part) > 0) {
        pid <- gsub("pid", "", pid_part)
      } else {
        pid <- NA
      }
      
      return(list(
        test_type = test_type,
        device_type = device_type,
        pid = pid,
        timestamp = NA
      ))
    }
  }
  
  # If the structured approach didn't work, try to extract information directly from the filename
  if (grepl("bracelet", basename_file, ignore.case=TRUE)) {
    device_type <- "bracelet"
  } else if (grepl("necklace", basename_file, ignore.case=TRUE)) {
    device_type <- "necklace"
  } else if (grepl("overear", basename_file, ignore.case=TRUE)) {
    device_type <- "overear"
  } else {
    device_type <- NA
  }
  
  if (grepl("two_point|twopoint", basename_file, ignore.case=TRUE)) {
    test_type <- "two_point_discrimination"
  } else if (grepl("localization", basename_file, ignore.case=TRUE)) {
    test_type <- "localization_accuracy"
  } else if (grepl("absolute", basename_file, ignore.case=TRUE)) {
    test_type <- "absolute_threshold"
  } else {
    test_type <- NA
  }
  
  # Try to extract PID
  pid_match <- regexpr("pid\\d+", basename_file)
  if (pid_match > 0) {
    pid_text <- regmatches(basename_file, pid_match)
    pid <- gsub("pid", "", pid_text)
  } else {
    pid <- NA
  }
  
  return(list(
    test_type = test_type,
    device_type = device_type,
    pid = pid,
    timestamp = NA
  ))
}

# Function to find all CSV files that match a specific pattern
find_csv_files <- function(folder_path, pattern) {
  # Get all CSV files in the directory (non-recursive, as we know the structure)
  all_files <- list.files(folder_path, pattern = "\\.csv$", full.names = TRUE, recursive = FALSE)
  
  # If no files found and this is a participant folder, try different approaches
  if (length(all_files) == 0 && grepl("[0-9]+$", basename(folder_path))) {
    cat("  No CSV files found directly in participant folder. Checking subdirectories...\n")
    
    # Try recursive search
    all_files <- list.files(folder_path, pattern = "\\.csv$", full.names = TRUE, recursive = TRUE)
    cat("  Found", length(all_files), "CSV files with recursive search\n")
  }
    
  # Extract only those matching the pattern
  files_matching <- all_files[grepl(pattern, all_files, ignore.case = TRUE)]
  
  return(files_matching)
}

# Create empty lists for each data type
localization_data <- list()
two_point_data <- list()
absolute_data <- list()

# Loop through each participant folder and extract data
for (pid_folder in participant_folders) {
  pid <- basename(pid_folder)
  
  cat("participant/folder:", pid, "\n")
  
  # Debug: list all CSV files in the folder
  all_csv_files <- list.files(pid_folder, pattern = "\\.csv$", full.names = TRUE, recursive = TRUE)
  cat("  Found", length(all_csv_files), "CSV files in total\n")
  
  # Find and process localization data
  loc_files <- find_csv_files(pid_folder, "localization")
  cat("  Found", length(loc_files), "localization files\n")
  
  for (file in loc_files) {
    metadata <- extract_metadata(file)
    device_type <- metadata$device_type
    
    # If metadata extraction failed, try to guess from filename
    if (is.na(device_type)) {
      filename <- basename(file)
      if (grepl("bracelet", filename, ignore.case = TRUE)) {
        device_type <- "bracelet"
      } else if (grepl("necklace", filename, ignore.case = TRUE)) {
        device_type <- "necklace"
      } else if (grepl("overear", filename, ignore.case = TRUE)) {
        device_type <- "overear"
      } else {
        device_type <- "unknown"
      }
      cat("    Guessed device type from filename:", device_type, "\n")
    }
    
    tryCatch({
      # Try reading with different options
      data <- read_csv(file, show_col_types = FALSE)
      
      # Add PID and device type columns if they don't exist
      if (!"PID" %in% names(data)) data$PID <- pid
      data$device_type <- device_type
      
      # Check for correct columns
      expected_cols <- c("Trial", "Motor", "Response")
      missing_cols <- expected_cols[!expected_cols %in% names(data)]
      
      if (length(missing_cols) > 0) {
        cat("    Warning: Missing expected columns:", paste(missing_cols, collapse=", "), "\n")
        cat("    Available columns:", paste(names(data), collapse=", "), "\n")
      } else {
        # Add to the appropriate list
        localization_data[[length(localization_data) + 1]] <- data
      }
    }, error = function(e) {
      cat("    Error loading file:", file, "Error:", e$message, "\n")
      
      # Try alternative reading method if first attempt fails
      tryCatch({
        cat("    Attempting alternative reading method...\n")
        data <- read.csv(file, stringsAsFactors = FALSE)
        data <- as_tibble(data)
        
        # Add PID and device type columns if they don't exist
        if (!"PID" %in% names(data)) data$PID <- pid
        if (!"device_type" %in% names(data)) data$device_type <- device_type
        
        # Check for correct columns
        expected_cols <- c("Trial", "Motor", "Response")
        missing_cols <- expected_cols[!expected_cols %in% names(data)]
        
        if (length(missing_cols) > 0) {
          cat("    Warning: Missing expected columns:", paste(missing_cols, collapse=", "), "\n")
          cat("    Available columns:", paste(names(data), collapse=", "), "\n")
        } else {
          # Add to the appropriate list
          localization_data[[length(localization_data) + 1]] <- data
          cat("    Successfully loaded with alternative method\n")
        }
      }, error = function(e2) {
        cat("    Alternative method also failed:", e2$message, "\n")
      })
    })
  }
  
  # Find and process two-point discrimination data
  tp_files <- find_csv_files(pid_folder, "two[ _\\-]point|twopoint")
  cat("  Found", length(tp_files), "two-point discrimination files\n")
    
  for (file in tp_files) {
    metadata <- extract_metadata(file)
    device_type <- metadata$device_type
    
    # If metadata extraction failed, try to guess from filename
    if (is.na(device_type)) {
      filename <- basename(file)
      if (grepl("bracelet", filename, ignore.case = TRUE)) {
        device_type <- "bracelet"
      } else if (grepl("necklace", filename, ignore.case = TRUE)) {
        device_type <- "necklace"
      } else if (grepl("overear", filename, ignore.case = TRUE)) {
        device_type <- "overear"
      } else {
        device_type <- "unknown"
      }
      cat("    Guessed device type from filename:", device_type, "\n")
    }
    
    tryCatch({
      # Try reading with different options
      data <- read_csv(file, show_col_types = FALSE)
      
      # Add PID and device type columns
      data$PID <- pid
      data$device_type <- device_type
        
      # Add to the appropriate list
      two_point_data[[length(two_point_data) + 1]] <- data
      
    }, error = function(e) {
      cat("    Error loading file:", file, "Error:", e$message, "\n")
      
      # Try alternative reading method if first attempt fails
      tryCatch({
        cat("    Attempting alternative reading method...\n")
        data <- read.csv(file, stringsAsFactors = FALSE)
        data <- as_tibble(data)
        data$PID <- pid
        data$device_type <- device_type
        
        # Add to the appropriate list
        two_point_data[[length(two_point_data) + 1]] <- data
        
        cat("    Successfully loaded with alternative method\n")
      }, error = function(e2) {
        cat("    Alternative method also failed:", e2$message, "\n")
      })
    })
  }
  
  # Find and process absolute threshold data
  abs_files <- find_csv_files(pid_folder, "absolute")
  cat("  Found", length(abs_files), "absolute threshold files\n")
    
  for (file in abs_files) {
    metadata <- extract_metadata(file)
    device_type <- metadata$device_type
    
    # If metadata extraction failed, try to guess from filename
    if (is.na(device_type)) {
      filename <- basename(file)
      if (grepl("bracelet", filename, ignore.case = TRUE)) {
        device_type <- "bracelet"
      } else if (grepl("necklace", filename, ignore.case = TRUE)) {
        device_type <- "necklace"
      } else if (grepl("overear", filename, ignore.case = TRUE)) {
        device_type <- "overear"
      } else {
        device_type <- "unknown"
      }
      cat("    Guessed device type from filename:", device_type, "\n")
    }
    
    tryCatch({
      # Try reading with different options
      data <- read_csv(file, show_col_types = FALSE)
      
      # Add PID and device type columns
      data$PID <- pid
      data$device_type <- device_type
      
      # Add to the appropriate list
      absolute_data[[length(absolute_data) + 1]] <- data
        
    }, error = function(e) {
      cat("    Error loading file:", file, "Error:", e$message, "\n")
      
      # Try alternative reading method if first attempt fails
      tryCatch({
        cat("    Attempting alternative reading method...\n")
        data <- read.csv(file, stringsAsFactors = FALSE)
        data <- as_tibble(data)
        data$PID <- pid
        data$device_type <- device_type
        
        # Add to the appropriate list
        absolute_data[[length(absolute_data) + 1]] <- data
        
        cat("    Successfully loaded with alternative method\n")
      }, error = function(e2) {
        cat("    Alternative method also failed:", e2$message, "\n")
      })
    })
  }
}

# Combine data for each test type
if (length(localization_data) > 0) {
  localization_combined <- bind_rows(localization_data)
  
  # Standardize column names - make sure we're using lowercase device_type
  # This handles any potential mixed-case issues in the source data
  if ("DeviceType" %in% names(localization_combined)) {
    localization_combined$device_type <- localization_combined$DeviceType
    localization_combined <- localization_combined %>% select(-DeviceType)
  } else if ("Device_Type" %in% names(localization_combined)) {
    localization_combined$device_type <- localization_combined$Device_Type
    localization_combined <- localization_combined %>% select(-Device_Type)
  }
  
  # Clean up device_type column
  localization_combined$device_type <- tolower(localization_combined$device_type)
  localization_combined$device_type <- ifelse(
    !localization_combined$device_type %in% c("bracelet", "necklace", "overear"),
    NA,
    localization_combined$device_type
  )
  
  # Remove rows with NA device types
  localization_combined <- localization_combined %>% filter(!is.na(device_type))
  
  # CRITICAL: Calculate Correct column for localization data
  localization_combined$Correct <- ifelse(
    localization_combined$Motor == localization_combined$Response, 1, 0
  )
  
  # Summary of device types
  cat("Device types distribution:\n")
  print(table(localization_combined$device_type, useNA = "ifany"))
  
  cat("Total localization data entries:", nrow(localization_combined), "\n")
} else {
  localization_combined <- NULL
  cat("No localization data found.\n")
}

localization_combined <- localization_combined %>%
  select(-`Device Type`) %>%
  mutate(
    Trial = as.numeric(Trial),
    Motor = as.numeric(Motor),
    Response = as.numeric(Response),
    PID = as.numeric(PID),
    correct = as.logical(Correct)
  )

if (length(two_point_data) > 0) {
  two_point_combined <- bind_rows(two_point_data)
  
  # Clean up Device_Type column
  two_point_combined$device_type <- tolower(two_point_combined$device_type)
  two_point_combined$device_type <- ifelse(
    !two_point_combined$device_type %in% c("bracelet", "necklace", "overear"),
    NA,
    two_point_combined$device_type
  )
  
  cat("Total two-point discrimination data entries:", nrow(two_point_combined), "\n")
} else {
  two_point_combined <- NULL
  cat("No two-point discrimination data found.\n")
}


two_point_combined <- two_point_combined %>%
  select(-DeviceType) %>%
  mutate(
    Trial = as.numeric(Trial),
    FirstMotor = as.numeric(FirstMotor),
    SecondMotor = as.numeric(SecondMotor),
    PID = as.numeric(PID),
    Correct = as.logical(Correct)
  )


## Loading in absolute threshold data
# Function to find header row and transform data properly
find_header_and_transform <- function(df) {
  header_row <- which(df[,1] == "Timestamp")
  
  if(length(header_row) == 0) {
    for(i in 1:ncol(df)) {
      header_candidates <- which(df[,i] == "Timestamp")
      if(length(header_candidates) > 0) {
        header_row <- header_candidates[1]
        break
      }
    }
  }
  
  if(length(header_row) == 0) {
    return(NULL)  # Return NULL if no header found
  }
  
  names(df) <- as.character(df[header_row,])
  df <- df[(header_row+1):nrow(df),]
  rownames(df) <- NULL
  return(df)
}

# Function to extract device type
get_device_type <- function(df, filename) {
  if("DeviceType" %in% names(df)) {
    device_types <- unique(df$DeviceType[!is.na(df$DeviceType)])
    if(length(device_types) > 0) {
      return(device_types[1])
    }
  }
  
  device_keywords <- c("bracelet", "necklace", "overear")
  for(keyword in device_keywords) {
    for(col in names(df)) {
      if(is.character(df[[col]]) || is.factor(df[[col]])) {
        if(any(grepl(keyword, df[[col]], ignore.case = TRUE))) {
          return(keyword)
        }
      }
    }
  }
  
  for(keyword in device_keywords) {
    if(grepl(keyword, filename, ignore.case = TRUE)) {
      return(keyword)
    }
  }
  
  return("Unknown Device")
}

# Set folder path
base_folder <- "../Data/Psychophysical Data/"
participant_folders <- list.dirs(path = base_folder, full.names = TRUE, recursive = FALSE)

# Initialize empty list to store data
data_list <- list()

# Process each participant folder
for (participant_folder in participant_folders) {
  pid <- basename(participant_folder)
  absolute_folder <- participant_folder  # Look directly in participant's folder
  
  if (!dir.exists(absolute_folder)) {
    next  # Skip if Absolute folder does not exist
  }
  
  csv_files <- list.files(path = absolute_folder, pattern = "absolute_threshold_.*\\.csv$|Absolute.*\\.csv$", full.names = TRUE, ignore.case = TRUE)
  
  for (csv_file in csv_files) {
    df <- read.csv(csv_file, header = FALSE, fill = TRUE, stringsAsFactors = FALSE)
    df <- find_header_and_transform(df)
    
    if (!is.null(df)) {
      device_type <- get_device_type(df, csv_file)
      df$PID <- pid
      df$device_type <- device_type
      data_list[[length(data_list) + 1]] <- df
    }
  }
}

# Verify loaded datasets
cat("Loaded", length(data_list), "datasets\n")

## Load questionnaire data
# Read the data
questionnaire_data <- read_csv("../Data/Qualtrics Data.csv")

# Remove first two rows from questionnaire_data
questionnaire_data <- questionnaire_data[-c(1,2),]
print("unique ID's in questionnaire data")
print(unique(questionnaire_data$PID))

# questionnaire_data$Q55 as numeric
questionnaire_data$Q55 <- as.numeric(questionnaire_data$Q55)
# questionnaire_data$Q58 as numeric
questionnaire_data$Q58 <- as.numeric(questionnaire_data$Q58)

questionnaire_data$PID <- as.numeric(questionnaire_data$PID)

# Rename columns for clarity

questionnaire_data$Neck_Circumference <- questionnaire_data$Q55
questionnaire_data$Wrist_Circumference <- questionnaire_data$Q58
questionnaire_data$Gender <- as.factor(questionnaire_data$Q59)
questionnaire_data$Hearing_Loss <-  as.factor(questionnaire_data$Q16)
questionnaire_data$Nerve_Damage <-  as.factor(questionnaire_data$Q103)
questionnaire_data$Assistive_Devices_Used <-  as.factor(questionnaire_data$Q17)
questionnaire_data$Overear_Comfort <-  as.numeric(questionnaire_data$Q85_1)
questionnaire_data$Necklace_Comfort <- as.numeric(questionnaire_data$Q85_2)
questionnaire_data$Bracelet_Comfort <- as.numeric(questionnaire_data$Q85_3)
questionnaire_data$Overear_Public_Acceptance <- as.numeric(questionnaire_data$Q100_1)
questionnaire_data$Necklace_Public_Acceptance <- as.numeric(questionnaire_data$Q100_2)
questionnaire_data$Bracelet_Public_Acceptance <- as.numeric(questionnaire_data$Q100_3)
questionnaire_data$Overear_Peer_Acceptance <- as.numeric(questionnaire_data$Q101_1)
questionnaire_data$Necklace_Peer_Acceptance <- as.numeric(questionnaire_data$Q101_2)
questionnaire_data$Bracelet_Peer_Acceptance <- as.numeric(questionnaire_data$Q101_3)
questionnaire_data$Device_Preference <- as.factor(questionnaire_data$Q102)
questionnaire_data$Device_Preference_Explanation <- questionnaire_data$Q86
questionnaire_data$Putting_On_and_Removal_Ease <- as.factor(questionnaire_data$"Q39#1_1")
questionnaire_data$Less_Noticable <- as.factor(questionnaire_data$"Q39#1_2")
questionnaire_data$Interfere_Less_With_Movement <- as.factor(questionnaire_data$"Q39#1_3")
questionnaire_data$Long_Term_Comfort <- as.factor(questionnaire_data$"Q39#1_4")

print(colnames(questionnaire_data))
print(summary(questionnaire_data))